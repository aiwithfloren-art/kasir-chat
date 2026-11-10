import { runAgent, rateLimited } from "@/lib/ai";
import { SHOP, allOrders, findOrder, saveOrder } from "@/lib/store";
import { createPaypalOrder } from "@/lib/paypal";
import { reminderText } from "@/lib/reminders";

const SYSTEM = `You are the business assistant for the owner of "${SHOP.name}". Answer questions about orders and sales.
- Be brief: numbers first, then one useful insight or suggestion.
- Always use tools for data. Never guess numbers. Money is USD.
- To refund, call propose_refund. It does NOT move money: the owner must press Approve on the card. Say so.
- Orders marked demo=true are sample history and cannot be refunded.
- To chase unpaid orders ("remind", "follow up", "nagih"), call send_payment_reminders. Each customer gets a reminder in their own language with a fresh PayPal payment link. Then say who was reminded and the total amount being chased.
- query_orders, sales_summary and send_payment_reminders also filter the live orders table on the owner's screen. Mention it in a few words (e.g. "I've filtered your table").`;

const inPeriod = (o, period) => {
  const ms = { today: 24, week: 24 * 7 }[period];
  return !ms || Date.now() - new Date(o.createdAt) < ms * 3600 * 1000;
};

const makeTools = ({ base }) => ({
  query_orders: {
    description: "List orders, optionally filtered by status and period.",
    parameters: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", enum: ["ALL", "PAID", "PENDING", "REFUNDED"] },
        period: { type: "STRING", enum: ["today", "week", "all"], description: "today = last 24 hours" },
      },
    },
    run: async ({ status = "ALL", period = "all" }) => ({
      view: { status, period },
      orders: (await allOrders())
        .filter((o) => (status === "ALL" || o.status === status) && inPeriod(o, period))
        .map(({ id, customer, items, total, status, createdAt, demo }) => ({
          id, customer, total, status, createdAt, demo,
          items: items.map((i) => `${i.qty}x ${i.name}`).join(", "),
        })),
    }),
  },
  sales_summary: {
    description: "Revenue, order counts and best sellers for a period. Revenue counts PAID orders only.",
    parameters: {
      type: "OBJECT",
      properties: { period: { type: "STRING", enum: ["today", "week", "all"] } },
    },
    run: async ({ period = "today" }) => {
      const os = (await allOrders()).filter((o) => inPeriod(o, period));
      const paid = os.filter((o) => o.status === "PAID");
      const pending = os.filter((o) => o.status === "PENDING");
      const best = {};
      paid.forEach((o) => o.items.forEach((i) => (best[i.name] = (best[i.name] || 0) + i.qty)));
      return {
        period,
        view: { status: "PAID", period },
        revenue: Math.round(paid.reduce((s, o) => s + o.total, 0) * 100) / 100,
        paid_orders: paid.length,
        pending_orders: pending.length,
        pending_value: Math.round(pending.reduce((s, o) => s + o.total, 0) * 100) / 100,
        best_sellers: Object.entries(best).sort((a, b) => b[1] - a[1]).slice(0, 3),
      };
    },
  },
  propose_refund: {
    description:
      "Prepare a refund for a PAID order. Give the order id, or the customer's name if the owner only says a name. Shows an Approve card to the owner; no money moves until approved.",
    parameters: {
      type: "OBJECT",
      properties: {
        order_id: { type: "STRING", description: "e.g. SC-1101 (optional if customer is given)" },
        customer: { type: "STRING", description: "Customer name, e.g. Jess" },
        reason: { type: "STRING" },
      },
    },
    run: async ({ order_id, customer, reason }) => {
      let o = order_id ? await findOrder(String(order_id).trim().toUpperCase()) : null;
      // Owners usually say a name ("refund Jess"), not an order id: find that customer's latest real paid order.
      const name = String(customer || (!o && order_id) || "").trim().toLowerCase();
      if (!o && name) {
        const match = (c) => {
          const n = String(c || "").toLowerCase();
          return n === name || n.startsWith(name) || name.startsWith(n);
        };
        const mine = (await allOrders())
          .filter((x) => match(x.customer))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        o = mine.find((x) => x.status === "PAID" && !x.demo && x.captureId) || mine[0];
      }
      if (!o) return { error: "Order not found. Ask the owner for the order id." };
      if (o.status !== "PAID") return { error: `Order is ${o.status}, only PAID orders can be refunded` };
      if (o.demo || !o.captureId) return { error: "This is a sample order without a real PayPal payment" };
      return { order_id: o.id, customer: o.customer, total: o.total, reason: reason || "" };
    },
  },
  send_payment_reminders: {
    description:
      "Send a payment reminder with a fresh PayPal payment link to customers with unpaid (PENDING) orders. Leave order_ids empty to remind every unpaid order.",
    parameters: {
      type: "OBJECT",
      properties: { order_ids: { type: "ARRAY", items: { type: "STRING" }, description: "Optional: only these orders" } },
    },
    run: async ({ order_ids }) => {
      const want = (order_ids || []).map((x) => String(x).toUpperCase());
      const pending = (await allOrders())
        .filter((o) => o.status === "PENDING" && (!want.length || want.includes(o.id)))
        .slice(0, 10);
      if (!pending.length) return { reminded: [], note: "No unpaid orders.", view: { status: "PENDING", period: "all" } };
      const reminded = [];
      for (const o of pending) {
        // A fresh PayPal order each time: links can expire, and the old button keeps working too.
        const pp = await createPaypalOrder(o, SHOP.name, base);
        if (o.paypalOrderId) o.paypalOrderIds = [...(o.paypalOrderIds || []), o.paypalOrderId];
        o.paypalOrderId = pp.id;
        o.payLink = pp.approveUrl;
        o.demo = false; // a sample order becomes a real sandbox order once it gets a real PayPal link
        o.reminders = [...(o.reminders || []), new Date().toISOString()];
        await saveOrder(o);
        const msg = reminderText(o.lang, o, SHOP.name, pp.approveUrl);
        reminded.push({
          order_id: o.id,
          customer: o.customer,
          total: o.total,
          items: o.items,
          paypal_order_id: pp.id,
          pay_link: pp.approveUrl,
          message: msg.full,
          chat_message: msg.chat,
          times_reminded: o.reminders.length,
        });
      }
      return {
        reminded,
        total_chased: Math.round(reminded.reduce((s, r) => s + r.total, 0) * 100) / 100,
        view: { status: "PENDING", period: "all" },
      };
    },
  },
});

export async function POST(req) {
  if (rateLimited(req)) return Response.json({ text: "Too many messages, please wait a few minutes.", events: [] });
  const { history, lang } = await req.json();
  try {
    return Response.json(await runAgent({
      system: SYSTEM,
      history: history || [],
      tools: makeTools({ base: req.headers.get("origin") || new URL(req.url).origin }),
      lang,
    }));
  } catch (e) {
    console.error(e);
    return Response.json({ text: "The assistant is busy right now. Please try again in a moment.", events: [] });
  }
}

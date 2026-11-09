import { runAgent, rateLimited } from "@/lib/ai";
import { SHOP, allOrders, findOrder } from "@/lib/store";

const SYSTEM = `You are the business assistant for the owner of "${SHOP.name}". Answer questions about orders and sales.
- Reply in the owner's language. Be brief: numbers first, then one useful insight or suggestion.
- Always use tools for data. Never guess numbers. Money is USD.
- To refund, call propose_refund. It does NOT move money: the owner must press Approve on the card. Say so.
- Orders marked demo=true are sample history and cannot be refunded.
- query_orders and sales_summary also filter the live orders table on the owner's screen. Mention it in a few words (e.g. "I've filtered your table").`;

const inPeriod = (o, period) => {
  const ms = { today: 24, week: 24 * 7 }[period];
  return !ms || Date.now() - new Date(o.createdAt) < ms * 3600 * 1000;
};

const tools = {
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
    description: "Prepare a refund for a PAID order. Shows an Approve card to the owner; no money moves until approved.",
    parameters: {
      type: "OBJECT",
      properties: { order_id: { type: "STRING" }, reason: { type: "STRING" } },
      required: ["order_id"],
    },
    run: async ({ order_id, reason }) => {
      const o = await findOrder(order_id);
      if (!o) return { error: "Order not found" };
      if (o.status !== "PAID") return { error: `Order is ${o.status}, only PAID orders can be refunded` };
      if (o.demo || !o.captureId) return { error: "This is a sample order without a real PayPal payment" };
      return { order_id: o.id, customer: o.customer, total: o.total, reason: reason || "" };
    },
  },
};

export async function POST(req) {
  if (rateLimited(req)) return Response.json({ text: "Too many messages, please wait a few minutes.", events: [] });
  const { history } = await req.json();
  try {
    return Response.json(await runAgent({ system: SYSTEM, history: history || [], tools }));
  } catch (e) {
    console.error(e);
    return Response.json({ text: "The assistant is busy right now. Please try again in a moment.", events: [] });
  }
}

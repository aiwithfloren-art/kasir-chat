import { runAgent, rateLimited } from "@/lib/ai";
import { MENU, SHOP, newOrder, findOrder, saveOrder } from "@/lib/store";
import { createPaypalOrder } from "@/lib/paypal";

const MENU_TEXT = MENU.map((m) => `- ${m.id}: ${m.name} ($${m.price.toFixed(2)}) [also called: ${m.aka}]`).join("\n");

const SYSTEM = `You are the friendly AI cashier of "${SHOP.name}", a small home bakery that sells through chat.

MENU (product_id: name (USD price) [local names]):
${MENU_TEXT}

RULES
- Short and warm, like a real shop chat.
- Only sell items on the MENU. Map what the customer says to a product_id using names and local names. Never invent products or prices.
- The [local names] are only for understanding customers. Never show them in replies.
- When showing the menu, one line per item: "• <name in the customer's language>: $<price>". No descriptions.
- To order you need: items + quantities + the customer's name. If the name is missing, ask once. Then call create_order right away (the payment card is the confirmation step).
- Lines like "[order SC-1234 created ...]" mean that order ALREADY exists. Do NOT call create_order again unless the customer clearly asks for a new or different order.
- Delivery time, address or special requests for an existing order: call add_note on that order, then confirm.
- Never say an order is placed unless create_order succeeded. After it succeeds, tell them the total and to pay with the PayPal button below. Don't paste links.
- If a message starts with [PAYMENT_CONFIRMED], PayPal verified the payment: thank them, confirm the order id, say the bakery is preparing it.
- Politely refuse anything unrelated to ordering from this bakery.`;

// Built per request so tools know the site URL (for PayPal return links) and the page language.
const makeTools = ({ base, lang }) => ({
  create_order: {
    description: "Create the order and a PayPal checkout for it. Prices are computed by the system.",
    parameters: {
      type: "OBJECT",
      properties: {
        customer_name: { type: "STRING" },
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              product_id: { type: "STRING", enum: MENU.map((m) => m.id) },
              qty: { type: "INTEGER" },
            },
            required: ["product_id", "qty"],
          },
        },
        note: { type: "STRING", description: "Delivery time/address or special request, if any." },
      },
      required: ["customer_name", "items"],
    },
    run: async ({ customer_name, items, note }) => {
      const order = await newOrder(customer_name, (items || []).map((i) => [i.product_id, i.qty]), note);
      const pp = await createPaypalOrder(order, SHOP.name, base);
      order.paypalOrderId = pp.id;
      order.payLink = pp.approveUrl;
      order.lang = lang || "en";
      await saveOrder(order);
      return { order_id: order.id, total: order.total, currency: "USD", items: order.items, paypal_order_id: pp.id };
    },
  },
  add_note: {
    description: "Attach delivery time, address or a special request to an existing order.",
    parameters: {
      type: "OBJECT",
      properties: { order_id: { type: "STRING" }, note: { type: "STRING" } },
      required: ["order_id", "note"],
    },
    run: async ({ order_id, note }) => {
      const o = await findOrder(order_id);
      if (!o || o.demo) return { error: "Order not found" };
      o.note = [o.note, String(note).slice(0, 200)].filter(Boolean).join(" | ");
      await saveOrder(o);
      return { ok: true, order_id: o.id, note: o.note };
    },
  },
});

const siteOrigin = (req) => req.headers.get("origin") || new URL(req.url).origin;

export async function POST(req) {
  if (rateLimited(req)) return Response.json({ text: "Too many messages, please wait a few minutes.", events: [] });
  const { history, lang } = await req.json();
  try {
    return Response.json(await runAgent({ system: SYSTEM, history: history || [], tools: makeTools({ base: siteOrigin(req), lang }), lang }));
  } catch (e) {
    console.error(e);
    return Response.json({ text: "Our AI cashier is busy right now. Please try again in a moment.", events: [] });
  }
}

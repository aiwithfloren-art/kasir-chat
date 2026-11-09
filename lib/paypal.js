// Thin wrapper around the PayPal REST API (sandbox).
const BASE = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

let cached = { token: null, exp: 0 };

async function token() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal auth failed (${r.status})`);
  const j = await r.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

async function call(path, body, method = "POST") {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`PayPal ${path} failed (${r.status}): ${j.message || j.name || ""}`);
  return j;
}

const money = (n) => n.toFixed(2);

// baseUrl lets PayPal send the buyer back to /paid when they pay through a shared link (reminders).
export async function createPaypalOrder(order, shopName, baseUrl) {
  const pp = await call("/v2/checkout/orders", {
    intent: "CAPTURE",
    ...(baseUrl && {
      application_context: {
        brand_name: shopName.slice(0, 127),
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: `${baseUrl}/paid`,
        cancel_url: `${baseUrl}/`,
      },
    }),
    purchase_units: [
      {
        reference_id: order.id,
        description: `${shopName} order ${order.id}`,
        amount: {
          currency_code: "USD",
          value: money(order.total),
          breakdown: { item_total: { currency_code: "USD", value: money(order.total) } },
        },
        items: order.items.map((l) => ({
          name: l.name.slice(0, 127),
          quantity: String(l.qty),
          unit_amount: { currency_code: "USD", value: money(l.price) },
        })),
      },
    ],
  });
  pp.approveUrl = pp.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href || null;
  return pp;
}

export const capturePaypalOrder = (pid) => call(`/v2/checkout/orders/${pid}/capture`, {});
export const refundCapture = (captureId, note) =>
  call(`/v2/payments/captures/${captureId}/refund`, { note_to_payer: (note || "Refund").slice(0, 255) });

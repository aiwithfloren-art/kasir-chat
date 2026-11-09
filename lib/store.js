// Store for the demo shop.
// Prices live ONLY here: the AI never decides a price.

export const SHOP = {
  name: "Sunny Crumbs Bakery",
  currency: "USD",
};

export const MENU = [
  { id: "lapis", name: "Layered Spice Cake (whole)", aka: "kue lapis, lapis legit", price: 24.0 },
  { id: "pandan", name: "Pandan Chiffon Cake", aka: "bolu pandan, chiffon pandan", price: 18.0 },
  { id: "brownie", name: "Fudgy Brownies (box of 9)", aka: "brownies, brownis", price: 15.0 },
  { id: "cookies", name: "Butter Cookies (jar)", aka: "kue kering, nastar-style cookies, kukis", price: 12.0 },
  { id: "bolu", name: "Steamed Sponge Cupcakes (6 pcs)", aka: "bolu kukus", price: 9.0 },
  { id: "cheese", name: "Cheese Tart (box of 4)", aka: "pie susu keju, tart keju", price: 14.0 },
];

// Real (sandbox) orders are saved in Upstash Redis when KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN)
// are set, so they survive serverless restarts. Without them, orders live in memory (fine for local dev).
// Sample orders are generated fresh on every read, relative to "now", so the demo dashboard never goes stale.
const R_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const R_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "kasir:orders";

async function redis(...cmd) {
  const r = await fetch(R_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const j = await r.json();
  if (j.error) throw new Error(`Redis: ${j.error}`);
  return j.result;
}

const g = globalThis;
const mem = (g.__kasir ||= { orders: {}, seq: 0 });

async function nextSeq() {
  return R_URL ? await redis("INCR", "kasir:seq") : ++mem.seq;
}

export async function saveOrder(o) {
  if (R_URL) await redis("HSET", KEY, o.id, JSON.stringify(o));
  else mem.orders[o.id] = o;
  return o;
}

async function realOrders() {
  if (!R_URL) return Object.values(mem.orders);
  const flat = (await redis("HGETALL", KEY)) || [];
  const out = [];
  for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]));
  return out;
}

function sampleOrders() {
  const now = Date.now();
  const h = 3600 * 1000;
  const rows = [
    ["Rina", [["lapis", 1]], "PAID", 26],
    ["Budi", [["brownie", 2]], "PAID", 25],
    ["Sari", [["pandan", 1], ["cookies", 1]], "PENDING", 30],
    ["Andi", [["cheese", 2]], "PAID", 50],
    ["Maya", [["bolu", 3]], "PAID", 4],
    ["Dewi", [["lapis", 2]], "PENDING", 3],
    ["Tono", [["cookies", 2], ["brownie", 1]], "PAID", 2],
    ["Lina", [["pandan", 2]], "PAID", 1],
  ];
  return rows.map(([customer, items, status, hoursAgo], i) => {
    const o = buildOrder(`SC-${1001 + i}`, customer, items, "");
    o.status = status;
    o.createdAt = new Date(now - hoursAgo * h).toISOString();
    if (status === "PAID") o.paidAt = new Date(now - hoursAgo * h + 10 * 60 * 1000).toISOString();
    o.demo = true; // sample, not a real PayPal sandbox payment
    return o;
  });
}

function buildOrder(id, customer, items, note) {
  const lines = items.map(([pid, qty]) => {
    const m = MENU.find((x) => x.id === pid);
    if (!m) throw new Error(`Unknown product: ${pid}`);
    const q = Math.max(1, Math.min(20, Math.round(Number(qty) || 1)));
    return { id: m.id, name: m.name, qty: q, price: m.price };
  });
  const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
  return {
    id,
    customer: String(customer || "Customer").slice(0, 40),
    items: lines,
    total,
    note: String(note || "").slice(0, 200),
    status: "PENDING",
    createdAt: new Date().toISOString(),
    paidAt: null,
    paypalOrderId: null,
    captureId: null,
    demo: false,
  };
}

// Not saved yet: call saveOrder() once the PayPal order id is attached.
export async function newOrder(customer, items, note) {
  return buildOrder(`SC-${1100 + (await nextSeq())}`, customer, items, note);
}

export async function allOrders() {
  const all = [...sampleOrders(), ...(await realOrders())];
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export const findOrder = async (id) => (await allOrders()).find((o) => o.id === id);
export const findByPaypal = async (pid) => (await realOrders()).find((o) => o.paypalOrderId === pid);

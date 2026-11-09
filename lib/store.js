// In-memory store for the demo shop. Resets when the server restarts.
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

const g = globalThis;
if (!g.__kasir) {
  g.__kasir = { orders: [], seq: 1000 };
  seed(g.__kasir);
}
const db = g.__kasir;

function seed(db) {
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
  for (const [customer, items, status, hoursAgo] of rows) {
    const o = buildOrder(db, customer, items, "");
    o.status = status;
    o.createdAt = new Date(now - hoursAgo * h).toISOString();
    if (status === "PAID") o.paidAt = new Date(now - hoursAgo * h + 10 * 60 * 1000).toISOString();
    o.demo = true; // seeded sample, not a real PayPal sandbox payment
    db.orders.push(o);
  }
}

function buildOrder(db, customer, items, note) {
  const lines = items.map(([id, qty]) => {
    const m = MENU.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown product: ${id}`);
    const q = Math.max(1, Math.min(20, Math.round(Number(qty) || 1)));
    return { id: m.id, name: m.name, qty: q, price: m.price };
  });
  const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
  return {
    id: `SC-${++db.seq}`,
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

export function newOrder(customer, items, note) {
  const o = buildOrder(db, customer, items, note);
  db.orders.push(o);
  return o;
}

export const allOrders = () => [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const findOrder = (id) => db.orders.find((o) => o.id === id);
export const findByPaypal = (pid) => db.orders.find((o) => o.paypalOrderId === pid);

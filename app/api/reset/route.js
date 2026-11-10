import { resetOrders } from "@/lib/store";

// Private demo reset. Needs the RESET_KEY secret; disabled when it isn't set.
export async function POST(req) {
  const key = process.env.RESET_KEY;
  if (!key || req.headers.get("x-reset-key") !== key) return Response.json({ error: "not allowed" }, { status: 403 });
  const removed = await resetOrders();
  return Response.json({ ok: true, removed });
}

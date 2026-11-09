import { refundCapture } from "@/lib/paypal";
import { findOrder, saveOrder } from "@/lib/store";

export async function POST(req) {
  const { orderId, reason } = await req.json();
  const o = await findOrder(orderId);
  if (!o || o.status !== "PAID" || !o.captureId) return Response.json({ error: "Not refundable" }, { status: 400 });
  try {
    const r = await refundCapture(o.captureId, reason);
    o.status = "REFUNDED";
    o.refundId = r.id;
    await saveOrder(o);
    return Response.json({ order: o });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Refund failed" }, { status: 500 });
  }
}

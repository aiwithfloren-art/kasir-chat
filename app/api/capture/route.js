import { capturePaypalOrder } from "@/lib/paypal";
import { findByPaypal, saveOrder } from "@/lib/store";

export async function POST(req) {
  const { paypalOrderId } = await req.json();
  const order = await findByPaypal(paypalOrderId);
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (order.status === "PAID") return Response.json({ order });
  try {
    const r = await capturePaypalOrder(paypalOrderId);
    const cap = r.purchase_units?.[0]?.payments?.captures?.[0];
    if (r.status !== "COMPLETED" || !cap) return Response.json({ error: "Payment not completed" }, { status: 400 });
    order.status = "PAID";
    order.paidAt = new Date().toISOString();
    order.captureId = cap.id;
    await saveOrder(order);
    return Response.json({ order });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Capture failed" }, { status: 500 });
  }
}

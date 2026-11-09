export const dynamic = "force-dynamic";
export async function GET() {
  // The PayPal client id is public by design (it is loaded in the browser SDK).
  return Response.json({ paypalClientId: process.env.PAYPAL_CLIENT_ID || "" });
}

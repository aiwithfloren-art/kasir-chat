"use client";
import { useEffect, useState } from "react";

// PayPal sends the buyer here (?token=<PayPal order id>) after they approve a payment from a shared reminder link.
export default function Paid() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return setState({ status: "error" });
    fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paypalOrderId: token }),
    })
      .then((r) => r.json())
      .then((j) => setState(j.order?.status === "PAID" ? { status: "paid", order: j.order } : { status: "error" }))
      .catch(() => setState({ status: "error" }));
  }, []);

  const o = state.order;
  return (
    <main className="paidpage">
      <div className="paidbox">
        <div className="logo">K</div>
        {state.status === "loading" && <h2>Confirming your PayPal payment…</h2>}
        {state.status === "error" && (
          <>
            <h2>We couldn't confirm this payment</h2>
            <p>Please go back to the shop chat and try the PayPal button again.</p>
          </>
        )}
        {state.status === "paid" && (
          <>
            <div className="tick">✓</div>
            <h2>Payment received. Thank you, {o.customer}!</h2>
            <p>
              Order <b>{o.id}</b> · <b>${o.total.toFixed(2)}</b> paid with PayPal
            </p>
            {o.items.map((i) => (
              <div className="row" key={i.id}>
                <span>
                  {i.qty}× {i.name}
                </span>
                <span>${(i.qty * i.price).toFixed(2)}</span>
              </div>
            ))}
            <p className="tx">PayPal transaction ID: {o.captureId}</p>
            <p>Sunny Crumbs Bakery is preparing your order.</p>
          </>
        )}
        <a href="/" className="back">
          Back to the shop
        </a>
      </div>
    </main>
  );
}

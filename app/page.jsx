"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const usd = (n) => `$${Number(n).toFixed(2)}`;

// ---------- PayPal JS SDK loader ----------
let sdkPromise;
function loadPaypal() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = fetch("/api/config")
    .then((r) => r.json())
    .then(
      ({ paypalClientId }) =>
        new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = `https://www.paypal.com/sdk/js?client-id=${paypalClientId}&currency=USD&intent=capture&components=buttons`;
          s.onload = () => resolve(window.paypal);
          s.onerror = reject;
          document.body.appendChild(s);
        })
    );
  return sdkPromise;
}

function PayCard({ order, onPaid }) {
  const box = useRef(null);
  const [paid, setPaid] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    loadPaypal().then((paypal) => {
      if (!alive || !box.current || box.current.childElementCount) return;
      paypal
        .Buttons({
          style: { layout: "horizontal", tagline: false, height: 40 },
          createOrder: () => order.paypal_order_id,
          onApprove: async () => {
            const r = await fetch("/api/capture", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paypalOrderId: order.paypal_order_id }),
            });
            const j = await r.json();
            if (j.order?.status === "PAID") {
              setPaid(true);
              onPaid(j.order);
            } else setErr("Payment could not be confirmed. Please try again.");
          },
          onError: () => setErr("PayPal had a problem. Please try again."),
        })
        .render(box.current);
    });
    return () => {
      alive = false;
    };
  }, [order.paypal_order_id]);
  return (
    <div className="card">
      <h4>Order {order.order_id}</h4>
      {order.items.map((i) => (
        <div className="row" key={i.id}>
          <span>
            {i.qty}× {i.name}
          </span>
          <span>{usd(i.qty * i.price)}</span>
        </div>
      ))}
      <div className="row total">
        <span>Total</span>
        <span>{usd(order.total)}</span>
      </div>
      {paid ? <div className="paid">✓ Paid with PayPal</div> : <div className="pp" ref={box} />}
      {err && <div style={{ color: "var(--coral)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}

function RefundCard({ proposal, onDone }) {
  const [state, setState] = useState("idle");
  const approve = async () => {
    setState("busy");
    const r = await fetch("/api/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: proposal.order_id, reason: proposal.reason }),
    });
    const j = await r.json();
    setState(j.order?.status === "REFUNDED" ? "done" : "error");
    if (j.order) onDone(j.order);
  };
  return (
    <div className="card">
      <h4>Refund needs your approval</h4>
      <div className="row">
        <span>
          {proposal.order_id} · {proposal.customer}
        </span>
        <b>{usd(proposal.total)}</b>
      </div>
      {proposal.reason && <div className="row" style={{ color: "var(--muted)" }}>{proposal.reason}</div>}
      {state === "done" ? (
        <div className="paid">✓ Refunded via PayPal</div>
      ) : (
        <button className="approve" disabled={state === "busy"} onClick={approve}>
          {state === "busy" ? "Refunding…" : state === "error" ? "Failed, try again" : "Approve refund"}
        </button>
      )}
    </div>
  );
}

// ---------- Generic chat ----------
function Chat({ endpoint, placeholder, chips, greeting, renderEvent, onAfterReply, inject }) {
  const [items, setItems] = useState([{ kind: "msg", role: "model", text: greeting }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    // New Chrome versions return a Promise from scrollIntoView; never return it from an effect.
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, busy]);
  const send = async (msg, { hidden = false } = {}) => {
    if (!msg.trim() || busy) return;
    const next = [...itemsRef.current, { kind: "msg", role: "user", text: msg, hidden }];
    setItems(next);
    setText("");
    setBusy(true);
    // Chat bubbles + a short memory line for every action card, so the AI remembers what it already did.
    const history = next
      .map((m) => {
        if (m.kind === "msg") return { role: m.role, text: m.text };
        if (m.kind === "event" && m.ev.result?.order_id) {
          const r = m.ev.result;
          return m.ev.tool === "create_order"
            ? { role: "model", text: `[order ${r.order_id} created, total $${r.total}, waiting for PayPal payment]` }
            : { role: "model", text: `[refund for ${r.order_id} proposed, waiting for owner approval]` };
        }
        return null;
      })
      .filter(Boolean);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      });
      const j = await r.json();
      const add = [];
      for (const ev of j.events || []) {
        if (renderEvent(ev)) add.push({ kind: "event", ev });
      }
      if (j.text) add.push({ kind: "msg", role: "model", text: j.text });
      setItems((cur) => [...cur, ...add]);
      onAfterReply?.();
    } catch {
      setItems((cur) => [...cur, { kind: "msg", role: "model", text: "Connection problem, please try again." }]);
    }
    setBusy(false);
  };

  // let parent push system notes / hidden prompts
  useEffect(() => {
    if (inject) inject.current = { send, note: (t) => setItems((c) => [...c, { kind: "note", text: t }]) };
  });

  return (
    <>
      <div className="msgs">
        {items.map((m, i) =>
          m.kind === "event" ? (
            <div key={i} style={{ display: "contents" }}>{renderEvent(m.ev)}</div>
          ) : m.kind === "note" ? (
            <div key={i} className="msg sys">{m.text}</div>
          ) : m.hidden ? null : (
            <div key={i} className={`msg ${m.role}`}>{m.text}</div>
          )
        )}
        {busy && <div className="typing">AI is typing…</div>}
        <div ref={end} />
      </div>
      {chips && (
        <div className="chips">
          {chips.map((c) => (
            <button key={c} onClick={() => send(c)} disabled={busy}>
              {c}
            </button>
          ))}
        </div>
      )}
      <form
        className="input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <button disabled={busy}>Send</button>
      </form>
    </>
  );
}

// ---------- Page ----------
export default function Home() {
  const [orders, setOrders] = useState([]);
  const buyerApi = useRef(null);

  const refresh = () =>
    fetch("/api/orders")
      .then((r) => r.json())
      .then((j) => setOrders(j.orders));
  useEffect(() => {
    refresh();
    // Only poll while the tab is visible, so an idle open tab doesn't burn database reads.
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 4000);
    return () => clearInterval(t);
  }, []);

  const kpi = useMemo(() => {
    const day = orders.filter((o) => Date.now() - new Date(o.createdAt) < 24 * 3600 * 1000);
    const paid = day.filter((o) => o.status === "PAID");
    return {
      revenue: paid.reduce((s, o) => s + o.total, 0),
      paid: paid.length,
      pending: day.filter((o) => o.status === "PENDING").length,
    };
  }, [orders]);

  const columns = useMemo(
    () => [
      { field: "id", headerName: "Order", width: 105 },
      { field: "customer", width: 110 },
      {
        headerName: "Items",
        flex: 1,
        minWidth: 180,
        valueGetter: (p) => p.data.items.map((i) => `${i.qty}× ${i.name}`).join(", "),
      },
      { field: "total", width: 95, valueFormatter: (p) => usd(p.value) },
      {
        field: "status",
        width: 115,
        cellRenderer: (p) => <span className={`pill ${p.value}`}>{p.value}</span>,
      },
      {
        field: "createdAt",
        headerName: "Time",
        width: 150,
        sort: "desc",
        valueFormatter: (p) =>
          new Date(p.value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      },
    ],
    []
  );

  const theme = useMemo(
    () => themeQuartz.withParams({ accentColor: "#E5462F", fontFamily: "inherit", headerBackgroundColor: "#FAF7F0", borderColor: "#EBE6DA" }),
    []
  );

  const onPaid = (order) => {
    refresh();
    buyerApi.current?.note(`PayPal payment received · ${order.id} · ${usd(order.total)}`);
    buyerApi.current?.send(`[PAYMENT_CONFIRMED] order ${order.id}, total ${usd(order.total)}, paid via PayPal.`, {
      hidden: true,
    });
  };

  return (
    <>
      <header className="top">
        <div className="logo">K</div>
        <div>
          <h1>Kasir Chat</h1>
          <p>AI cashier for small sellers who sell through chat · powered by PayPal + AI</p>
        </div>
        <span className="badge">PayPal Sandbox demo · no real money</span>
      </header>
      <main className="split">
        <section className="panel buyer">
          <div className="head">
            <div className="dot" />
            <div>
              <b>Sunny Crumbs Bakery</b>
              <br />
              <span>Customer view · chat to order</span>
            </div>
          </div>
          <Chat
            endpoint="/api/buyer"
            greeting="Hi! Welcome to Sunny Crumbs Bakery 🍰 What would you like to order today?"
            placeholder="e.g. 2 brownie boxes for tomorrow, I'm Rina"
            chips={[
              "What's on the menu?",
              "2 brownie boxes for pickup tomorrow, I'm Jess",
              "Hola, quiero un pastel de pandan, soy Carlos",
              "Kak, pesan 2 kue lapis ya, atas nama Rina",
            ]}
            inject={buyerApi}
            renderEvent={(ev) =>
              ev.tool === "create_order" && ev.result?.paypal_order_id ? <PayCard order={ev.result} onPaid={onPaid} /> : null
            }
            onAfterReply={refresh}
          />
        </section>

        <section className="owner">
          <div className="kpis">
            <div className="kpi">
              <small>Revenue (24h)</small>
              <div>{usd(kpi.revenue)}</div>
            </div>
            <div className="kpi">
              <small>Paid orders</small>
              <div>{kpi.paid}</div>
            </div>
            <div className="kpi">
              <small>Waiting for payment</small>
              <div>{kpi.pending}</div>
            </div>
          </div>

          <div className="panel grid">
            <div className="head">
              <b>Orders</b>
              <span>updates live when a PayPal payment lands</span>
            </div>
            <div className="ag">
              <AgGridReact theme={theme} rowData={orders} columnDefs={columns} getRowId={(p) => p.data.id} animateRows />
            </div>
          </div>

          <div className="panel">
            <div className="head">
              <b>Ask your shop</b>
              <span>owner assistant</span>
            </div>
            <Chat
              endpoint="/api/owner"
              greeting="Hi boss! Ask me anything about your orders and sales."
              placeholder="e.g. How much did we make today?"
              chips={["How much did we make today?", "Who hasn't paid yet?", "What's my best seller this week?"]}
              renderEvent={(ev) =>
                ev.tool === "propose_refund" && ev.result?.order_id ? <RefundCard proposal={ev.result} onDone={refresh} /> : null
              }
            />
          </div>
        </section>
      </main>
    </>
  );
}

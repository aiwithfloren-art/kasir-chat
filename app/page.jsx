"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";

import { LANGS, T } from "@/lib/i18n";

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

function PayCard({ order, onPaid, t }) {
  const box = useRef(null);
  const [paid, setPaid] = useState(null);
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
              setPaid(j.order);
              onPaid(j.order);
            } else setErr(t.payFail);
          },
          onError: () => setErr(t.paypalErr),
        })
        .render(box.current);
    });
    return () => {
      alive = false;
    };
  }, [order.paypal_order_id]);
  return (
    <div className="card">
      <h4>{t.order} {order.order_id}</h4>
      {order.items.map((i) => (
        <div className="row" key={i.id}>
          <span>
            {i.qty}× {i.name}
          </span>
          <span>{usd(i.qty * i.price)}</span>
        </div>
      ))}
      <div className="row total">
        <span>{t.total}</span>
        <span>{usd(order.total)}</span>
      </div>
      {paid ? (
        <>
          <div className="paid">{t.paidPaypal}</div>
          <div className="tx">{t.txId}: {paid.captureId}</div>
        </>
      ) : (
        <div className="pp" ref={box} />
      )}
      {err && <div style={{ color: "var(--coral)", fontSize: 12 }}>{err}</div>}
    </div>
  );
}

function RefundCard({ proposal, onDone, t }) {
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
      <h4>{t.refundTitle}</h4>
      <div className="row">
        <span>
          {proposal.order_id} · {proposal.customer}
        </span>
        <b>{usd(proposal.total)}</b>
      </div>
      {proposal.reason && <div className="row" style={{ color: "var(--muted)" }}>{proposal.reason}</div>}
      {state === "done" ? (
        <div className="paid">{t.refunded}</div>
      ) : (
        <button className="approve" disabled={state === "busy"} onClick={approve}>
          {state === "busy" ? t.refunding : state === "error" ? t.refundFail : t.approve}
        </button>
      )}
    </div>
  );
}

function ReminderCard({ result, t }) {
  if (!result.reminded?.length) return null;
  return (
    <div className="card">
      <h4>{t.remindersTitle(result.reminded.length, usd(result.total_chased))}</h4>
      {result.reminded.map((r) => (
        <div className="remind" key={r.order_id}>
          <div className="row">
            <span>
              {r.order_id} · {r.customer}
            </span>
            <b>{usd(r.total)}</b>
          </div>
          <div className="remindmsg">{r.message.replace(r.pay_link, "").trim()}</div>
          <div className="row">
            <span className="sent">✓ {t.sent}</span>
            {r.pay_link && (
              <a href={r.pay_link} target="_blank" rel="noreferrer">
                {t.openLink}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Generic chat ----------
function Chat({ endpoint, placeholder, chips, greeting, renderEvent, onEvent, onAfterReply, inject, t, lang }) {
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
          if (m.ev.tool === "create_order")
            return { role: "model", text: `[order ${r.order_id} created, total $${r.total}, waiting for PayPal payment]` };
          if (m.ev.tool === "reminder")
            return { role: "model", text: `[payment reminder sent for order ${r.order_id} with a new PayPal button]` };
          return { role: "model", text: `[refund for ${r.order_id} proposed, waiting for owner approval]` };
        }
        return null;
      })
      .filter(Boolean);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, lang }),
      });
      const j = await r.json();
      const add = [];
      for (const ev of j.events || []) {
        onEvent?.(ev);
        if (renderEvent(ev)) add.push({ kind: "event", ev });
      }
      if (j.text) add.push({ kind: "msg", role: "model", text: j.text });
      setItems((cur) => [...cur, ...add]);
      onAfterReply?.();
    } catch {
      setItems((cur) => [...cur, { kind: "msg", role: "model", text: t.connError }]);
    }
    setBusy(false);
  };

  // let parent push system notes / hidden prompts
  useEffect(() => {
    if (inject)
      inject.current = {
        send,
        note: (t) => setItems((c) => [...c, { kind: "note", text: t }]),
        push: (item) => setItems((c) => [...c, item]),
      };
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
        {busy && <div className="typing">{t.typing}</div>}
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
        <button disabled={busy}>{t.send}</button>
      </form>
    </>
  );
}

// ---------- Page ----------
export default function Home() {
  const [orders, setOrders] = useState([]);
  const [lang, setLangState] = useState("en");
  const t = T[lang];
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kasir-lang");
      if (T[saved]) setLangState(saved);
    } catch {}
  }, []);
  const setLang = (l) => {
    setLangState(l);
    try {
      localStorage.setItem("kasir-lang", l);
    } catch {}
  };
  const buyerApi = useRef(null);
  const buyerOrderIds = useRef(new Set()); // orders placed in this browser's customer chat
  const gridRef = useRef(null);
  // Table view the owner's AI assistant can set: { status: ALL|PAID|PENDING|REFUNDED, period: today|week|all }
  const [view, setView] = useState(null);
  const viewRef = useRef(view);
  viewRef.current = view;

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
      { field: "id", headerName: t.cols.id, width: 105 },
      { field: "customer", headerName: t.cols.customer, width: 110 },
      {
        headerName: t.cols.items,
        flex: 1,
        minWidth: 180,
        valueGetter: (p) => p.data.items?.map((i) => `${i.qty}× ${i.name}`).join(", ") ?? p.data.itemsLabel,
      },
      { field: "total", headerName: t.cols.total, width: 95, enableCellChangeFlash: true, valueFormatter: (p) => usd(p.value) },
      {
        field: "status",
        headerName: t.cols.status,
        width: 115,
        enableCellChangeFlash: true,
        cellRenderer: (p) => (p.node.rowPinned ? p.value : <span className={`pill ${p.value}`}>{p.value}</span>),
      },
      {
        headerName: t.cols.followUp,
        width: 130,
        enableCellChangeFlash: true,
        valueGetter: (p) => (p.data.reminders?.length ? p.data.reminders.length : null),
        cellRenderer: (p) =>
          p.value ? (
            <span className="pill remindpill" title={new Date(p.data.reminders.at(-1)).toLocaleString()}>
              {t.reminded(p.value)}
            </span>
          ) : null,
      },
      {
        field: "createdAt",
        headerName: t.cols.time,
        width: 150,
        sort: "desc",
        valueFormatter: (p) =>
          p.value && new Date(p.value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      },
    ],
    [t]
  );

  const theme = useMemo(
    () => themeQuartz.withParams({ accentColor: "#E5462F", fontFamily: "inherit", headerBackgroundColor: "#FAF7F0", borderColor: "#EBE6DA" }),
    []
  );

  // ---- AG Grid: AI-driven filter + live totals row ----
  const PERIOD_MS = { today: 24 * 3600e3, week: 7 * 24 * 3600e3 };
  const isExternalFilterPresent = useCallback(() => !!viewRef.current, []);
  const doesExternalFilterPass = useCallback((node) => {
    const v = viewRef.current;
    const o = node.data;
    if (v.status && v.status !== "ALL" && o.status !== v.status) return false;
    const ms = PERIOD_MS[v.period];
    return !ms || Date.now() - new Date(o.createdAt) < ms;
  }, []);
  const updateTotals = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    let n = 0;
    let sum = 0;
    api.forEachNodeAfterFilter((node) => {
      n++;
      sum += node.data.total;
    });
    const row = { id: "TOTAL", customer: tRef.current.totalRow(n), itemsLabel: tRef.current.totalLabel, total: sum, status: "" };
    const old = api.getPinnedBottomRow(0)?.data;
    // Only touch the totals row when it really changed, so the flash means "something happened".
    if (!old || old.customer !== row.customer || old.itemsLabel !== row.itemsLabel || old.total !== row.total) api.setGridOption("pinnedBottomRowData", [row]);
  }, []);
  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [view]);
  useEffect(() => {
    updateTotals();
  }, [lang, updateTotals]);
  const onOwnerEvent = (ev) => {
    applyView(ev);
    if (ev.tool === "send_payment_reminders") {
      refresh();
      // Reminders for orders placed in the customer chat on this page show up there, with a fresh PayPal button.
      for (const r of ev.result?.reminded || []) {
        if (buyerOrderIds.current.has(r.order_id)) buyerApi.current?.push({ kind: "event", ev: { tool: "reminder", result: r } });
      }
    }
  };
  const applyView = (ev) => {
    const v = ev.result?.view;
    if (!v) return;
    setView(v.status === "ALL" && v.period === "all" ? null : v);
  };
  const viewLabel = (v) =>
    [v.status && v.status !== "ALL" ? v.status : t.allStatuses, t.periods[v.period || "all"]].join(" · ");

  const onPaid = (order) => {
    refresh();
    buyerApi.current?.note(t.paymentNote(order.id, usd(order.total)));
    buyerApi.current?.send(`[PAYMENT_CONFIRMED] order ${order.id}, total ${usd(order.total)}, paid via PayPal. (System note: reply in the customer's language.)`, {
      hidden: true,
    });
  };

  return (
    <>
      <header className="top">
        <div className="logo">K</div>
        <div>
          <h1>Kasir Chat</h1>
          <p>{t.tagline}</p>
        </div>
        <span className="badge">{t.badge}</span>
        <label className="langs">
          <span aria-hidden="true">🌐</span>
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main className="split">
        <section className="panel buyer">
          <div className="head">
            <div className="dot" />
            <div>
              <b>Sunny Crumbs Bakery</b>
              <br />
              <span>{t.customerView}</span>
            </div>
          </div>
          <Chat
            key={`buyer-${lang}`}
            t={t}
            lang={lang}
            endpoint="/api/buyer"
            greeting={t.buyerGreeting}
            placeholder={t.buyerPlaceholder}
            chips={t.buyerChips}
            inject={buyerApi}
            onEvent={(ev) => ev.tool === "create_order" && ev.result?.order_id && buyerOrderIds.current.add(ev.result.order_id)}
            renderEvent={(ev) =>
              ev.tool === "create_order" && ev.result?.paypal_order_id ? (
                <PayCard order={ev.result} onPaid={onPaid} t={t} />
              ) : ev.tool === "reminder" ? (
                <>
                  <div className="msg model">{ev.result.chat_message}</div>
                  <PayCard order={ev.result} onPaid={onPaid} t={t} />
                </>
              ) : null
            }
            onAfterReply={refresh}
          />
        </section>

        <section className="owner">
          <div className="kpis">
            <div className="kpi">
              <small>{t.revenue}</small>
              <div>{usd(kpi.revenue)}</div>
            </div>
            <div className="kpi">
              <small>{t.paidOrders}</small>
              <div>{kpi.paid}</div>
            </div>
            <div className="kpi">
              <small>{t.waiting}</small>
              <div>{kpi.pending}</div>
            </div>
          </div>

          <div className="panel grid">
            <div className="head">
              <b>{t.orders}</b>
              {view ? (
                <button className="filterchip" onClick={() => setView(null)}>
                  {t.filtered}: {viewLabel(view)} ✕
                </button>
              ) : (
                <span>{t.ordersHint}</span>
              )}
            </div>
            <div className="ag">
              <AgGridReact
                ref={gridRef}
                theme={theme}
                rowData={orders}
                columnDefs={columns}
                getRowId={(p) => p.data.id}
                animateRows
                isExternalFilterPresent={isExternalFilterPresent}
                doesExternalFilterPass={doesExternalFilterPass}
                onFilterChanged={updateTotals}
                onRowDataUpdated={updateTotals}
                onGridReady={updateTotals}
                getRowClass={(p) => (p.node.rowPinned ? "totalrow" : p.data.status === "PENDING" ? "pendingrow" : "")}
              />
            </div>
          </div>

          <div className="panel">
            <div className="head">
              <b>{t.askShop}</b>
              <span>{t.ownerAssistant}</span>
            </div>
            <Chat
              key={`owner-${lang}`}
              t={t}
              lang={lang}
              endpoint="/api/owner"
              greeting={t.ownerGreeting}
              placeholder={t.ownerPlaceholder}
              chips={t.ownerChips}
              onEvent={onOwnerEvent}
              renderEvent={(ev) =>
                ev.tool === "propose_refund" && ev.result?.order_id ? (
                  <RefundCard proposal={ev.result} onDone={refresh} t={t} />
                ) : ev.tool === "send_payment_reminders" && ev.result?.reminded?.length ? (
                  <ReminderCard result={ev.result} t={t} />
                ) : null
              }
            />
          </div>
        </section>
      </main>
    </>
  );
}

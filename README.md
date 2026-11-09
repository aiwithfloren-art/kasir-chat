# Kasir Chat: AI Cashier for Chat Sellers

Millions of small sellers (home bakers, resellers, small shops) take orders through chat. They type prices by hand, send payment details, wait, check, and copy every order into a notebook or spreadsheet. Orders get lost and buyers forget to pay.

**Kasir Chat** ("kasir" means cashier in Indonesian) is an AI cashier that sits in the shop's chat:

1. **Buyer chats naturally**, in any language (UI in 8 languages: English, Spanish, Portuguese, French, Indonesian, Chinese, Japanese, Hindi) ("Kak, pesan 2 kue lapis ya, atas nama Rina").
2. **AI builds the order** from the menu and creates a **PayPal checkout** right inside the chat.
3. **Buyer pays with PayPal**. The server captures the payment and the AI confirms the order.
4. **Owner sees it live** in an AG Grid dashboard and can **ask the shop questions** in plain language ("How much did we make today?", "Who hasn't paid yet?").
5. **AI chases unpaid orders**: the owner says "remind everyone who hasn't paid" and the AI sends each customer a reminder in their own language with a fresh PayPal payment link (shareable anywhere; after paying, PayPal returns the buyer to a receipt page).
6. **Refunds with a human in the loop**: the AI can propose a refund, but money only moves after the owner clicks **Approve**.

> **Live demo: https://kasir-chat.vercel.app** · runs on **PayPal Sandbox**, no real money moves.

## How PayPal is used

| Step | PayPal API |
|---|---|
| AI creates the order | Orders v2 `POST /v2/checkout/orders` (intent CAPTURE, itemized breakdown) |
| Buyer pays in chat | PayPal JS SDK Buttons |
| Payment confirmed | Orders v2 `POST /v2/checkout/orders/{id}/capture` |
| AI sends a payment reminder | Orders v2 create with `return_url`, shareable approve link → `/paid` captures it |
| Owner approves refund | Payments v2 `POST /v2/payments/captures/{id}/refund` |

## How AI is used

- **Buyer agent** (`app/api/buyer`): tool calling with `create_order` and `add_note`. The AI never sets prices: product ids are restricted to the menu and totals are computed on the server.
- **Owner agent** (`app/api/owner`): tools `query_orders`, `sales_summary`, `send_payment_reminders`, `propose_refund`. Query tools also filter the live AG Grid table. Refunds are only proposed; a person approves them.
- Models via [OpenRouter](https://openrouter.ai): `google/gemini-2.5-flash`, falling back to `openai/gpt-4.1-mini`.

## Tech stack

Next.js 16 (React 19) · PayPal Orders v2 + Payments v2 + JS SDK · OpenRouter (Gemini 2.5 Flash) · AG Grid Community · Upstash Redis · hosted on Vercel

## Run it locally

```bash
git clone https://github.com/aiwithfloren-art/kasir-chat.git
cd kasir-chat
npm install
cp .env.example .env   # then fill in your keys
npm run build && npm start   # http://localhost:3000
```

`.env` needs:

```
PAYPAL_CLIENT_ID=      # PayPal Developer Dashboard > Apps & Credentials (Sandbox)
PAYPAL_CLIENT_SECRET=
OPENROUTER_API_KEY=    # openrouter.ai > Keys
AI_MODELS=google/gemini-2.5-flash,openai/gpt-4.1-mini   # optional
KV_REST_API_URL=       # optional: Upstash Redis, so orders survive restarts
KV_REST_API_TOKEN=
```

To pay, log in to the PayPal popup with a **sandbox Personal account** (developer.paypal.com > Testing Tools > Sandbox Accounts). Judges: a ready-made sandbox buyer login is in the Devpost submission's testing notes.

## Notes

- Real sandbox orders are saved in Upstash Redis when it is configured (in memory otherwise). The shop always shows a few sample orders so the dashboard is never empty.
- Prices are in USD because the sandbox checkout uses USD.

## License

MIT, see [LICENSE](LICENSE).

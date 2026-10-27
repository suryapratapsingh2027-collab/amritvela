# Amrit Vela Trust — WhatsApp bot & payments audit (2026-10-27)

## Root causes found (from the live chat + code)

| # | Symptom you saw | Root cause | Fix |
|---|---|---|---|
| 1 | Razorpay = paid, DB = PENDING, no receipt | Webhook-only reconciliation. Payment-Link payments arrive as `payment.captured` with Razorpay's *internal* order id (never stored), so nothing matched; `payment_link.paid` was the only matching event and depends on dashboard config. | Live reconcile against the Razorpay API (`paymentLink.fetch` / `orders.fetch`) when the donor asks, on every captured webhook, and every 2 min by a sweeper. Webhooks are now just a fast path. |
| 2 | "Kardiya donation" → "kitni rakam donate karna chahte hain?" | "Kar diya / kardiya / ho gaya" was not a payment-claim phrase; the word "donation" triggered the amount prompt. Receipt regex used `\b`, which doesn't work for Devanagari. | New payment-claim + receipt intent, checked before everything else; token-based matching. |
| 3 | Ordered **Nariyal**, order created for **Gangajal** | Product was re-derived from the last 8 outbound messages: `products.find(p => msgs.some(m => m.text.includes(p.name)))`. The product *list* message contains every name, and the list is alphabetical → Gangajal always won. | Checkout state is stored explicitly in `Conversation.state` (product id, qty, address, step) with a 30-min TTL. |
| 4 | "Nariyal kharidna h gangajal nahi" → Gangajal | Substring match, no negation. | Token matcher with negation ("nahi/mat/not"), typo tolerance, spacing tolerance. |
| 5 | "Nariyal order karna h" → "Kripya poora address…" | While waiting for an address, *any* text was treated as the address. | Product mentions switch the product mid-checkout; addresses must contain a valid 6-digit PIN + enough words. |
| 6 | "Kar diya donation meri receipt?" → product list | Hard-coded product keywords (`diya`, `mala`) matched inside "kar **diya**". | Product names come from the DB only, whole-token match. |
| 7 | **Data corruption risk** | Webhook queries used `where: { razorpayOrderId: payment.order_id }`. If `order_id` is missing Prisma treats `undefined` as *no filter* → one `payment.failed` marks **all** pending orders/donations FAILED; one `payment.captured` can mark all orders PAID. (Reproduced: 3 of 3 rows changed.) | Empty ids are never queried; `payment.failed` only touches `order_…` checkout ids. |
| 8 | Possible double stock decrement / double messages | `markOrderPaid` was read-then-write; `payment_link.paid` path bypassed it (no stock, no invoice). | Atomic claim (`updateMany … paymentStatus != PAID`), single path for every source. Oversell after payment clamps stock to 0 and logs `[STOCK OVERSELL]` instead of throwing (customer already paid). |
| 9 | Duplicate orders/donations on Meta retries | Dedupe checked for an *OUT* message, which doesn't exist yet during a slow first attempt; handler returned 500 on errors → Meta retried → another donation/order. | Atomic claim of each WhatsApp message id (unique `WebhookEvent`), always reply 200, errors → apology message. All messages in a payload are processed (before: only the first). |
| 10 | "New Product ₹0" and demo rows visible | Sellable filter only in AI code; `bootstrap.ts` recreated demo products at every boot. | One `isSellable()` filter (active, price>0, not demo/placeholder) used everywhere; bootstrap no longer recreates demos. |
| 11 | Receipt reliability | Receipt was a public URL WhatsApp had to fetch (cold start/timeouts), marked sent even on failure, shows "now" not payment date. | PDF uploaded to WhatsApp media API; link only as fallback; `receiptSentAt` exactly-once claim with retry; receipt shows payment id/date/trust header. |
| 12 | Misc | Link failure left phantom PENDING donation/order; HUMAN mode ignored (bot talked over agent); bare "500" after the amount prompt unhandled; public `GET /api/orders/:number` leaked phone+address; Shiprocket webhook unauthenticated; no WhatsApp signature check. | Failed → FAILED/CANCELLED; HUMAN mode honoured ("menu" returns to bot); state machine; PII removed; optional `SHIPROCKET_WEBHOOK_TOKEN`; optional `WHATSAPP_APP_SECRET` signature verification. |

## New behaviour (all deterministic, no LLM for money/orders)
- Order flow: product → (name) → address+PIN → **summary & "haan" confirmation** → Razorpay link. Quantity supported ("2 nariyal"), stock/price checked at confirmation.
- Donation flow: amount → (name for receipt) → link. After payment: text + PDF receipt automatically.
- "receipt", "kardiya", "payment ho gaya", `DON-…`, `ORD-…` → live check with Razorpay → honest answer (never claims PAID unless verified; never tells donor to pay again).
- Only open Trust questions go to Gemini (grounded, as before).

## Deploy checklist (do these or payments will still look stuck)
1. `npm ci && npx prisma generate && npm run build`; `npm start` runs `prisma migrate deploy` (new migration `20261024100000_…`, adds nullable columns only; existing PAID donations are back-filled as already-receipted).
2. Render env: `MOCK_PROVIDERS=false`, `RAZORPAY_KEY_ID/SECRET`, **`RAZORPAY_WEBHOOK_SECRET`**, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `API_URL`, `WEB_URL`, optional `WHATSAPP_APP_SECRET`, `GEMINI_API_KEY`. Open `/health` → the `config` block shows which are set.
3. Razorpay → Webhooks: URL `https://<api>/webhooks/razorpay` (also works at `/api/webhooks/razorpay`), same secret as `RAZORPAY_WEBHOOK_SECRET`, events **payment_link.paid, payment.captured, payment.failed, order.paid**. Check Render logs for `[RAZORPAY WEBHOOK] Received`. A `Signature verification FAILED` log = wrong secret.
4. Meta → WhatsApp webhook URL `https://<api>/webhooks/whatsapp`, subscribe to `messages`.
5. **Render free tier sleeps**: the 2-min sweeper does not run while asleep. Use a paid instance (or an uptime ping on `/health`) for production.
6. Receipts/links are free-form messages: WhatsApp only allows them within 24h of the customer's last message. Fine for this flow; for later reminders create approved templates.
7. Your existing stuck ₹900 donation: after deploying, the donor writing "receipt" (or the sweeper within 3 days of creation) reconciles it with Razorpay automatically. Nothing is marked paid without Razorpay confirming amount ≥ expected.
8. Rotate secrets that were visible in chat/uploads if any were shared; admin password is reset from `ADMIN_PASSWORD` on each boot.

## Verification performed
- `tsc` clean, `npm run build` OK, migrations applied in order on PostgreSQL 16.
- 34 unit tests (language rules) + 37 end-to-end checks against a real Postgres with the real webhook router/bot/payments code; only WhatsApp send and Razorpay API were faked. Includes your exact chat transcript, webhook replays, race conditions, underpayment, oversell, signature failures.
- NOT verified: live Razorpay/WhatsApp/Gemini calls (no credentials here). Razorpay's real `paymentLink.fetch` response shape was coded defensively from its documented fields; do one real ₹1 donation end-to-end in staging and watch the logs.

## Known remaining items (not changed)
- Public `/api/assistant` accepts any `phone` in the body (lookups still need an exact DON-/ORD- reference). Prefer WhatsApp for personal lookups.
- Orders don't reserve stock until paid (oversell handled safely, but needs a human to refund/fulfil).
- Admin product create/update passes `req.body` straight to Prisma (admin-only).

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

---
# Update 2026-10-27 (round 2): shipment 400, Trust knowledge, product photos

| Problem | Root cause | Fix |
|---|---|---|
| Admin "Create shipment" → `Request failed with status code 400` | The Shiprocket payload was incomplete/invalid: `billing_address` was sent as the stored JSON object (not text), no city, state, pincode, phone, email, sku or `payment_method`; pickup location hard-coded to `Primary`; empty `channel_id`; AWB/courier was never assigned (Shiprocket needs a second call); and the real Shiprocket error text was swallowed. | New `shipOrder`: builds the full payload (address text, city/state from PIN via India Post with text fallback, 10-digit phone, email, sku, Prepaid, weight/dimensions), reads the pickup location from `SHIPROCKET_PICKUP_LOCATION` or your Shiprocket account, calls `courier/assign/awb`, and shows Shiprocket's real validation message in the admin alert. If the Shiprocket order is created but the courier step fails (e.g. wallet balance), pressing Create shipment again only retries the courier step (no duplicate). |
| Bot has no Trust information | Production boot only created a placeholder doc ("Add the Trust-approved mission…"); the real text lived in `prisma/trust-knowledge.ts`, used only by the manual seed script. Gemini therefore received nothing. | Verified knowledge (from your website pages) now in `src/services/trust-knowledge.ts`, loaded on every boot (replaces the placeholder / old seed; hand-edited admin documents are never overwritten). Keyword search fallback answers Hinglish questions even if Gemini is off, rate-limited or empty. |
| "Trust ka address kahan hai" treated as order tracking | `kahan hai` matched the tracking intent | Tracking intent now needs order/parcel context |
| Product photos not on WhatsApp | Bot only sent text | Photo (admin's Cloudinary image, forced to a 1000px JPEG) sent with price questions, when starting checkout, and for "Nariyal photo". Failure to send a photo never blocks the text. |

New env vars (all optional): `SHIPROCKET_PICKUP_LOCATION` (exact pickup nickname from Shiprocket), `SHIPROCKET_FALLBACK_EMAIL`, `SHIPROCKET_DEFAULT_WEIGHT_KG` (default 0.5 per item). New migration `20261027120000_shiprocket_shipment_id`.

Shiprocket checklist: create an API user (Settings → API) and use *its* email/password in `SHIPROCKET_EMAIL/PASSWORD`; add a pickup address; keep wallet balance; the customer's PIN must be serviceable.
Photos: only public `https://` images work (Cloudinary uploads from the admin panel do). Photos must be under 5 MB.
Tests: 35 + 22 unit, 55 end-to-end checks pass. Not verified live: Shiprocket's real API (payload validated against Shiprocket's documented required fields with a mock).

## Hotfix: "No pickup address found in Shiprocket"
Shiprocket returned no pickup address for the API login. Pickup parsing now handles every known response shape and prefers a verified address; if it is still empty the error shows Shiprocket's raw response. Fastest fix: set `SHIPROCKET_PICKUP_LOCATION` to the exact "Pickup Location" name from Shiprocket > Settings > Pickup Addresses.

---
# Round 3 (2026-10-28): admin panel, auth, images, support inbox, website chat

| # | Request / finding | Root cause | Fix |
|---|---|---|---|
| 1 | Show password on login | n/a | Eye toggle (`PasswordInput`) on login, reset, change-password. Default credentials no longer pre-filled in the login form. |
| 2 | Forgot password / change email | Missing | `/forgot-password` + `/reset-password` pages; API: one-time 30-min token (only its hash is stored), identical response for known/unknown emails, rate limited. Admin → **Account** tab: change email and password (current password required). Password change/reset revokes all other sessions (`tokenVersion`). |
| 2b | **Hidden bug**: bootstrap reset the admin password to `ADMIN_PASSWORD` at every restart and re-created the old email | Upsert on every boot | First admin only created if none exists. Emergency recovery: `ADMIN_RESET_ON_BOOT=true` for one deploy. |
| 3 | Product image upload | Missing (product `imageUrl` could only be typed) | Admin product form uploads a photo (Cloudinary), auto-cropped in the browser to **1000×1000 square** so every product looks identical on website/cart/WhatsApp (WhatsApp gets a JPEG via Cloudinary transform). Website grid uses a fixed 1:1 frame. Needs `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_UPLOAD_PRESET` (the API tells the admin if missing). |
| 4 | Product form unclear | One-line inline inputs, no labels, "+ Add" created a ₹0 "New Product" row | Real form: labelled fields with help text (name/price/stock/category/description/photo/visible), inline validation, server validation with specific messages, duplicate-name protection (the bot finds products by name), slug auto-generated, placeholder rows no longer created. Public catalogue hides ₹0/placeholder rows. API no longer stores raw `req.body`. |
| 5 | Support: admin cannot send | **`POST /api/admin/conversations/:id/reply` did not exist (404)** | Implemented. New Support inbox: list with channel/mode/"needs reply", live thread (auto-refresh), Enter-to-send, real error reasons (e.g. WhatsApp 24-hour window), take over / return to bot. Replying automatically takes over so the bot never talks over the agent. |
| 6 | Stock numbers shown on WhatsApp | Bot/AI printed "40 available" | Customers never see quantities: out-of-stock products are hidden from the list, a direct ask gets "abhi stock mein nahi hai". Website shows "In stock / Out of stock". AI prompt forbids revealing quantities. |
| 7 | Website assistant asks for an order id | `/api/assistant` used the plain AI, not the order/donation bot | Website chat now uses the same deterministic bot (order, donation, receipt, status) with name + mobile captured once, product photos, clickable payment links, admin replies delivered into the widget, history restore, rate limits. |
| 8 | Other findings | Overlapping names ("Mala" vs "Rudraksha Mala") confused the bot; website/donation/order forms stored raw phone (`9876543210` ≠ WhatsApp `919876543210` → duplicate customers); cart "Pay" silently did nothing on empty fields and showed developer text; API errors showed raw JSON; shop page showed scaffold text; CORS broke if `WEB_URL` had a trailing slash; knowledge docs edited in the panel could be overwritten by auto-updates; receipts retried forever for website donors | Longest-name match wins; phone normalised everywhere (`utils/phone.ts`); cart/donate validation + messages; `ApiError` shows the sentence; scaffold removed; CORS normalised; editing a knowledge doc drops its auto-update marker; receipt retries capped at 5. |

New env vars (all optional): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` (password-reset emails; without them the reset link is printed in the API log), `ADMIN_RESET_ON_BOOT`.
New migration `20261028100000_admin_auth_web_chat` (adds columns/table only).

Verification: API `tsc` + build clean; 36 + 23 unit and **83 end-to-end checks** against real Postgres (auth flows, validation, reply route, web chat, regressions); web `next build` clean; **15 component tests** (show-password, product form, inbox reply + error display, account settings, website chat).
Not verified: live Cloudinary upload and in-browser canvas cropping (no browser/Cloudinary here), real SMTP delivery, Shiprocket/Razorpay/WhatsApp live calls. Do one real photo upload, one password-reset email and one admin reply in staging.

## Hotfix (round 3.1): build errors on a monorepo install
- `required_error` is not a valid option in zod 4 (a monorepo can hoist zod 4 even though this app declares ^3). The code no longer uses version-specific options; verified with zod 3.25 and 4.6 (83 end-to-end checks each).
- `@types/express`, `@types/cors`, `@types/jsonwebtoken`, `@types/pdfkit`, `typescript`, `prisma` moved to `dependencies` so a production-style install (`NODE_ENV=production`, Render) can still run `npm run build`.
- Run `npm install` at the monorepo root. Do not run `npm i @prisma/client@latest` (it can jump major versions).

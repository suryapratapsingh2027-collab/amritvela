# TrustConnect — WhatsApp Commerce, Donation & Support Platform

A production-oriented WhatsApp-first platform for Trust information, AI assistance, donations, product commerce, Razorpay payments, order management, Shiprocket fulfilment/tracking, invoices/receipts and human support.

## Included workflows
- Public Trust website with donation, shop and order tracking.
- AI assistant UI backed by OpenAI when configured; safe deterministic mock assistant in development.
- Trust knowledge base stored in PostgreSQL and editable from admin.
- Product catalogue, stock-aware cart and checkout.
- Donation checkout with Razorpay or safe mock payments.
- Order checkout with Razorpay or safe mock payments.
- Payment verification plus Razorpay webhook handling.
- Automatic inventory decrement after successful order payment.
- WooCommerce adapter for paid orders when configured.
- Shiprocket shipment creation and AWB tracking adapter.
- Shiprocket webhook status updates for shipped/out-for-delivery/delivered/cancelled.
- WhatsApp Cloud API inbound AI replies and outbound order/payment/shipping notifications.
- PDF donation receipts and order invoices.
- Admin authentication, dashboard, products, orders, donations, customers, conversations, human takeover and knowledge base.

## Local setup
1. Copy `apps/api/.env.example` to `apps/api/.env` and set at least `DATABASE_URL`. Development defaults are supplied for admin login and mock providers.
2. Copy `apps/web/.env.example` to `apps/web/.env.local`.
3. Install dependencies: `npm install`.
4. Generate Prisma client: `npm run db:generate`.
5. Create/update local database: `npm run db:migrate`.
6. Seed demo products, admin and knowledge placeholder: `npm run seed`.
7. Start both apps: `npm run dev`.

Web: http://localhost:3000
API: http://localhost:4000/health

Development admin defaults (when not overridden):
- Email: `admin@example.com`
- Password: `change-me`

## Production deployment
1. Create a managed PostgreSQL database.
2. Set all production environment variables in `apps/api/.env` / hosting secret manager. Use a strong `JWT_SECRET` and admin password.
3. Set `MOCK_PROVIDERS=false`.
4. Configure OpenAI, Meta WhatsApp Cloud API, Razorpay, Shiprocket and optional WooCommerce credentials.
5. Run `npm install` and `npm run db:generate`.
6. Run `npm run db:deploy` to apply Prisma migrations.
7. Run `npm run seed` once to create/update the admin account, starter catalogue and knowledge placeholder; replace the placeholder Trust knowledge with approved content from the admin console.
8. Build with `npm run build`.
9. Run API with `npm run start -w apps/api` and web with `npm run start -w apps/web` (or use your hosting provider's equivalent start commands).
10. Configure HTTPS URLs in `WEB_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`.
11. Configure provider webhooks:
   - Meta WhatsApp verification: `GET /webhooks/whatsapp`; events: `POST /webhooks/whatsapp`
   - Razorpay: `POST /webhooks/razorpay`
   - Shiprocket: `POST /webhooks/shiprocket`

## Environment ownership
Third-party credentials belong to the Trust/client account. The application code does not hard-code provider secrets. Keep `.env` and `.env.local` out of source control.

## Important production checks
- Replace the seeded placeholder Trust knowledge before enabling AI.
- Use a publicly reachable HTTPS API URL for WhatsApp/Razorpay/Shiprocket webhooks.
- Verify provider webhook secrets/signatures in the provider dashboards.
- Configure a real public invoice/receipt URL if WhatsApp document delivery is enabled.
- Test a small Razorpay payment, one order, one shipment and one WhatsApp conversation in the client's accounts before go-live.

# API audit and changes

## Files reviewed
- `src/routes/webhooks.ts`
- `src/services/donation-payment-link.ts`
- `src/integrations/razorpay.ts`
- `src/routes/donations.ts`
- `src/services/ai.ts`
- `src/routes/assistant.ts`
- `src/middleware/auth.ts`
- `src/config.ts`
- `src/services/fulfillment.ts`
- `prisma/schema.prisma`
- `package.json`, `tsconfig.json`

## Changes made
1. Razorpay `payment.captured` donation reconciliation now checks the matching checkout amount/currency before marking a donation paid; Payment Link `payment_link_id` is reconciled separately.
2. Payment Link donation lookup can also use `payment_link.notes.donationId`, which is set when creating the link.
3. Donation paid updates use a conditional `PENDING` update to reduce duplicate receipt notifications on repeated webhook deliveries.
4. `payment.failed` only changes records still in `PENDING`, so a late failed event cannot downgrade an already-paid order/donation.
5. Previously stored webhook event IDs are no longer blindly returned before reconciliation. The event record is upserted as processed after handling; handlers should remain idempotent.
6. Transactional assistant intents (donation, order tracking, product data, human support) now use deterministic replies from the database context rather than asking Gemini to generate claims about payments, prices, stock, or order states.
7. Removed a hard-coded deployment URL from the no-Gemini donation reply; the URL is based on configured `WEB_URL`.
8. Assistant conversation retrieval and WhatsApp preview sending now require admin authentication.
9. Standard donation creation validates a whole-number amount and applies the same ₹1 to ₹1,00,00,000 limit as the Payment Link flow.

## Important verification notes
- The uploaded archive has no `package-lock.json`.
- `npm run build` was attempted and failed because the archive's `node_modules` does not contain required packages/types such as `express`, `zod`, `razorpay`, and `@types/node`. As a result, a clean build could not be verified in this environment.
- After deploying, run `npm install` (or `npm ci` once a lockfile is generated), then `npm run prisma:generate`, `npm run build`, and test the Razorpay webhook in a staging environment.
- The already-stored historical `payment.captured` event shown in the incident did not include `payment_link_id`; code changes alone cannot infer a missing Payment Link ID from that old payload. The ₹500 donation should be reconciled only after checking the payment/link in Razorpay's authenticated dashboard/API. Do not ask the donor to pay again or manually mark it paid without verification.
- This is a targeted source audit of the backend files above, not a claim that every runtime integration has been end-to-end tested. Provider credentials and live webhooks were not available here.

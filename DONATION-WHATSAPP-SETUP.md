# WhatsApp Donation Payment Link Setup

## Backend behavior
- WhatsApp messages that contain a donation intent and an amount create a Donation row and a Razorpay Payment Link.
- The Payment Link URL is sent to the same WhatsApp number.
- Razorpay webhook signatures are checked using `RAZORPAY_WEBHOOK_SECRET`.
- `payment_link.paid` reconciles the payment with the donation, marks it `PAID`, and sends the PDF receipt URL as a WhatsApp document.
- The existing website order-based donation checkout and `payment.captured` order fulfillment path remain available.

## Razorpay Dashboard
Set the webhook URL to:
`https://YOUR-RENDER-BACKEND-URL/webhooks/razorpay`

Use the same secret in Razorpay Dashboard and Render's `RAZORPAY_WEBHOOK_SECRET`. Subscribe to:
- `payment_link.paid` (required for WhatsApp Payment Links)
- `payment.captured` (existing website/order payments)
- `payment.failed` (existing failure handling)

## Render environment
- `MOCK_PROVIDERS=false`
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` configured with the matching live/test mode credentials
- `RAZORPAY_WEBHOOK_SECRET` configured with the webhook's secret
- `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` configured
- `API_URL` must be the public HTTPS URL of this Render API, because WhatsApp must fetch the PDF receipt from `/api/donations/:id/receipt`.

Do not commit credentials. Test with Razorpay test-mode credentials before switching to live mode.

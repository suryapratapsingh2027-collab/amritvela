# Render + Vercel deployment guide

This repository is an npm-workspaces monorepo. Keep the repository root as the project root for both services so npm can see the root `package.json` and `package-lock.json`.

## Before deploying

1. Commit `package.json` and `package-lock.json` together.
2. Use Node.js 22 or newer supported by the hosting platforms.
3. Create a managed PostgreSQL database and copy its connection string.
4. Do not commit `.env` files or put secrets in the frontend environment.

## Render API service

- **Root Directory:** leave blank (repository root)
- **Build Command:** `npm install --include=dev && npm run db:generate && npm run build -w packages/shared && npm run build -w @trust/api`
- **Start Command:** `npm run start -w @trust/api`
- Add these environment variables in Render:
  - `NODE_ENV=production`
  - `DATABASE_URL` = managed PostgreSQL connection string
  - `WEB_URL` = exact deployed Vercel origin, e.g. `https://your-site.vercel.app` (no trailing slash)
  - `API_URL` = Render API HTTPS URL (no trailing slash)
  - `JWT_SECRET` = long, unique random secret
  - `ADMIN_EMAIL` = admin email to use
  - `ADMIN_PASSWORD` = strong unique admin password
  - `MOCK_PROVIDERS=false` for real integrations; keep `true` only while intentionally testing mock payments
  - Set integration variables only when that integration is being configured: `OPENAI_API_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `WOOCOMMERCE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`.
- The API start script runs `prisma migrate deploy` before bootstrapping and starting the server. Do not use `prisma migrate dev` against production.
- Health check: open `https://YOUR-API.onrender.com/health`; expected JSON contains `ok: true`.

## Vercel web service

- **Root Directory:** leave blank (repository root)
- **Framework Preset:** Next.js
- **Install Command:** `npm install --include=dev`
- **Build Command:** `npm run build -w @trust/web`
- Add environment variable `NEXT_PUBLIC_API_URL` = the Render API HTTPS URL (no trailing slash), for Production and any Preview environment you intend to test.
- Redeploy after setting environment variables.

## After deployment

1. Confirm Render `/health` returns `ok: true`.
2. Open the Vercel site and test the home page, shop, cart, donation page, order tracking and admin login.
3. Log into `/login` using `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured on Render.
4. For admin gallery/poster uploads, configure Cloudinary's cloud name and an upload preset that permits unsigned uploads, or change the upload implementation to use a signed server-side upload. Do not expose Cloudinary API secrets in `NEXT_PUBLIC_*` variables.
5. Set the Meta callback URL to `https://YOUR-API.onrender.com/webhooks/whatsapp`; the verify token must exactly match `WHATSAPP_VERIFY_TOKEN`.
6. Set Razorpay webhook URL to `https://YOUR-API.onrender.com/webhooks/razorpay` and its secret to `RAZORPAY_WEBHOOK_SECRET`.
7. Set Shiprocket webhook URL to `https://YOUR-API.onrender.com/webhooks/shiprocket` if using Shiprocket tracking events.
8. Test payments using Razorpay Test Mode first. Only enable live payment keys after the account and checkout flow are verified.

## Notes

- `MOCK_PROVIDERS=false` is parsed as a real boolean. Mock payment endpoints are disabled when it is false.
- A successful build does not prove third-party credentials or webhook subscriptions work. Test each integration in its provider dashboard.
- Do not run database reset commands or `prisma migrate dev` on production data.

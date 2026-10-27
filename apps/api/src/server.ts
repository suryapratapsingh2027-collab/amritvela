
import express from 'express';
import cors from 'cors';
import { env } from './config';

import auth from './routes/auth';
import products from './routes/products';
import donations from './routes/donations';
import orders from './routes/orders';
import admin from './routes/admin';
import webhooks from './routes/webhooks';
import assistant from './routes/assistant';
import media from './routes/media';
import { startPaymentSweeper } from './services/payments';

const app = express();

// Render/Vercel sit behind a proxy; needed for correct protocol/IP handling.
app.set('trust proxy', 1);

// Allowed frontend origins
const allowedOrigins = [
  env.WEB_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://web-l9dbq09an-suryapratapsingh2027-collabs-projects.vercel.app',
].filter(
  (origin): origin is string =>
    typeof origin === 'string' && origin.trim().length > 0
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header, such as server-to-server calls.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  })
);

// Request body parsing
app.use(
  express.json({
    limit: '12mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'trust-api',
    mockProviders: env.MOCK_PROVIDERS,
    // Booleans only (never values): quick way to spot the misconfigurations that leave payments PENDING.
    config: {
      razorpayKeys: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
      razorpayWebhookSecret: Boolean(env.RAZORPAY_WEBHOOK_SECRET),
      whatsappSend: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
      whatsappSignatureCheck: Boolean(env.WHATSAPP_APP_SECRET),
      gemini: Boolean(env.GEMINI_API_KEY),
      paymentSweepMs: env.RECONCILE_INTERVAL_MS,
    },
  });
});

// API routes
app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/donations', donations);
app.use('/api/orders', orders);
app.use('/api/admin', admin);
app.use('/api/assistant', assistant);
app.use('/api/media', media);

// Webhooks
const logWebhook = (req: any, _res: any, next: any) => {
  console.log('[WEBHOOK REQUEST]', req.method, req.originalUrl);
  next();
};
app.use('/webhooks', logWebhook);
app.use('/api/webhooks', logWebhook);

// Mounted at both paths so the dashboard URL works either way:
//   https://<api>/webhooks/razorpay   and   https://<api>/api/webhooks/razorpay
app.use('/webhooks', webhooks);
app.use('/api/webhooks', webhooks);

// Error handler
app.use(
  (err: any, _req: any, res: any, _next: any) => {
    console.error(err);

    res.status(500).json({
      error:
        env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message || 'Internal server error',
    });
  }
);

// Start server
app.listen(env.PORT, () => {
  console.log(`API listening on ${env.API_URL}`);
  startPaymentSweeper();
});

process.on('unhandledRejection', (reason) => console.error('[UNHANDLED REJECTION]', reason));

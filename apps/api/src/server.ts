
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

const app = express();

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
app.use('/webhooks', (req, _res, next) => {
  console.log('[WEBHOOK REQUEST]', req.method, req.originalUrl);
  next();
});

app.use('/webhooks', webhooks);

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
});

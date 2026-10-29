
import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),

    PORT: z.coerce.number().int().positive().default(4000),

    WEB_URL: z.string().url().default('http://localhost:3000'),
    API_URL: z.string().url().default('http://localhost:4000'),

    DATABASE_URL: z.string().min(1),

    JWT_SECRET: z
      .string()
      .default('local-development-secret-change-in-production'),

    ADMIN_EMAIL: z.string().email().default('admin@example.com'),
    ADMIN_PASSWORD: z.string().min(6).default('change-me'),
    // true = on every boot, reset the ADMIN_EMAIL account's password to ADMIN_PASSWORD (emergency recovery). Default: only create the first admin.
    ADMIN_RESET_ON_BOOT: z.enum(['true', 'false']).default('false'),

    // Outgoing email (password reset). If unset, reset links are printed in the server log instead.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(465),
    SMTP_SECURE: z.enum(['true', 'false']).optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),

    // Gemini AI
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),

    // Legacy OpenAI settings (optional; not used by the updated Gemini ai.ts)
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-4.1-mini'),

    // WhatsApp Cloud API
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().default('change-me'),
    // Meta App Secret: when set, every incoming WhatsApp webhook must carry a valid X-Hub-Signature-256.
    WHATSAPP_APP_SECRET: z.string().optional(),

    // Razorpay
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    // How often (ms) pending payments are re-checked directly against Razorpay (webhook safety net). 0 disables.
    RECONCILE_INTERVAL_MS: z.coerce.number().int().min(0).default(120000),

    // Shiprocket
    SHIPROCKET_EMAIL: z.string().optional(),
    SHIPROCKET_PASSWORD: z.string().optional(),
    // Must match the pickup location "nickname" in Shiprocket > Settings > Pickup Addresses. If empty, the first pickup address of the account is used.
    SHIPROCKET_PICKUP_LOCATION: z.string().optional(),
    // Shiprocket requires a customer email; used when the customer has none.
    SHIPROCKET_FALLBACK_EMAIL: z.string().default('amritvelatrustlive@gmail.com'),
    SHIPROCKET_DEFAULT_WEIGHT_KG: z.coerce.number().positive().default(0.5),
    // Optional shared secret: if set, Shiprocket webhooks must send it in the x-api-key header.
    SHIPROCKET_WEBHOOK_TOKEN: z.string().optional(),
    SHIPROCKET_BASE_URL: z
      .string()
      .url()
      .default('https://apiv2.shiprocket.in/v1/external'),

    // WooCommerce
    WOOCOMMERCE_URL: z.string().optional(),
    WOOCOMMERCE_CONSUMER_KEY: z.string().optional(),
    WOOCOMMERCE_CONSUMER_SECRET: z.string().optional(),

    // Keep this true until your production providers are configured
    MOCK_PROVIDERS: z.preprocess(
      (value) => {
        if (typeof value === 'string') {
          return value.trim().toLowerCase() === 'true';
        }

        return value;
      },
      z.boolean()
    ).default(true),
  })
  .parse(process.env);

// Production safety checks
if (schema.NODE_ENV === 'production') {
  const requiredProductionValues: Record<string, string> = {
    JWT_SECRET: schema.JWT_SECRET,
    ADMIN_EMAIL: schema.ADMIN_EMAIL,
    ADMIN_PASSWORD: schema.ADMIN_PASSWORD,
    WHATSAPP_VERIFY_TOKEN: schema.WHATSAPP_VERIFY_TOKEN,
  };

  for (const [key, value] of Object.entries(requiredProductionValues)) {
    if (
      !value ||
      (key === 'JWT_SECRET' &&
        value === 'local-development-secret-change-in-production') ||
      (key === 'ADMIN_PASSWORD' && value === 'change-me') ||
      (key === 'WHATSAPP_VERIFY_TOKEN' && value === 'change-me')
    ) {
      throw new Error(`${key} must be changed in production`);
    }
  }
}

// Loud (but non-fatal) warnings: these are the misconfigurations that silently leave payments PENDING.
if (schema.NODE_ENV === 'production') {
  if (schema.MOCK_PROVIDERS) {
    console.error('[CONFIG] MOCK_PROVIDERS=true in production: no real WhatsApp messages or Razorpay links will work. Set MOCK_PROVIDERS=false.');
  } else {
    const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID']
      .filter((k) => !(schema as Record<string, unknown>)[k]);
    if (missing.length) console.error(`[CONFIG] Missing required production env vars: ${missing.join(', ')}`);
    if (!schema.WHATSAPP_APP_SECRET) console.warn('[CONFIG] WHATSAPP_APP_SECRET not set: incoming WhatsApp webhooks are NOT signature-verified.');
  }
}

export const env = schema;
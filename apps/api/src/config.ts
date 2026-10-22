
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

    // Razorpay
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    // Shiprocket
    SHIPROCKET_EMAIL: z.string().optional(),
    SHIPROCKET_PASSWORD: z.string().optional(),
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

export const env = schema;
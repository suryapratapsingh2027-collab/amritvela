import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'), PORT: z.coerce.number().default(4000), WEB_URL: z.string().default('http://localhost:3000'), API_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1), JWT_SECRET: z.string().default('local-development-secret-change-in-production'), ADMIN_EMAIL: z.string().email().default('admin@example.com'), ADMIN_PASSWORD: z.string().min(6).default('change-me'),
  OPENAI_API_KEY: z.string().optional(), OPENAI_MODEL: z.string().default('gpt-5.6-mini'),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(), WHATSAPP_PHONE_NUMBER_ID: z.string().optional(), WHATSAPP_VERIFY_TOKEN: z.string().default('change-me'),
  RAZORPAY_KEY_ID: z.string().optional(), RAZORPAY_KEY_SECRET: z.string().optional(), RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  SHIPROCKET_EMAIL: z.string().optional(), SHIPROCKET_PASSWORD: z.string().optional(), SHIPROCKET_BASE_URL: z.string().default('https://apiv2.shiprocket.in/v1/external'),
  WOOCOMMERCE_URL: z.string().optional(), WOOCOMMERCE_CONSUMER_KEY: z.string().optional(), WOOCOMMERCE_CONSUMER_SECRET: z.string().optional(),
  MOCK_PROVIDERS: z.coerce.boolean().default(true),
}).parse(process.env);

if (schema.NODE_ENV === 'production') {
  for (const [key, value] of Object.entries({ JWT_SECRET: schema.JWT_SECRET, ADMIN_EMAIL: schema.ADMIN_EMAIL, ADMIN_PASSWORD: schema.ADMIN_PASSWORD })) {
    if (!value || (key === 'JWT_SECRET' && value === 'local-development-secret-change-in-production') || (key === 'ADMIN_PASSWORD' && value === 'change-me')) throw new Error(`${key} must be changed in production`);
  }
}
export const env = schema;

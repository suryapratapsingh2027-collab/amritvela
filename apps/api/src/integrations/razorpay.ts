import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../config';

const rp = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
  : null;

export async function createPayment(amount: number, receipt: string) {
  if (env.MOCK_PROVIDERS) return { id: `mock_${receipt}`, amount, currency: 'INR', receipt };
  if (!rp) throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or enable MOCK_PROVIDERS only for testing.');
  return rp.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt });
}

/** Creates a customer-facing Razorpay Payment Link (amount is INR). */
export async function createDonationPaymentLink(input: {
  amount: number; reference: string; donationId: string; name?: string | null;
  email?: string | null; phone: string;
}) {
  if (env.MOCK_PROVIDERS) {
    return { id: `mock_pl_${input.reference}`, short_url: `${env.WEB_URL}/donate?reference=${encodeURIComponent(input.reference)}&mock=1`, amount: Math.round(input.amount * 100), currency: 'INR', status: 'created', notes: { donationId: input.donationId, reference: input.reference } };
  }
  if (!rp) throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  const client = rp as any;
  return client.paymentLink.create({
    amount: Math.round(input.amount * 100),
    currency: 'INR',
    accept_partial: false,
    reference_id: input.reference,
    description: `Donation to Amrit Vela Trust (${input.reference})`,
    customer: { name: input.name || 'Donor', email: input.email || undefined, contact: input.phone },
    notify: { sms: false, email: false },
    reminder_enable: true,
    notes: { donationId: input.donationId, reference: input.reference },
  });
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  if (!env.RAZORPAY_KEY_SECRET) return env.MOCK_PROVIDERS;
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

export function verifySignature(body: string, signature: string) {
  // Never accept unsigned Razorpay webhooks in production.
  if (!env.RAZORPAY_WEBHOOK_SECRET) return env.NODE_ENV !== 'production' && env.MOCK_PROVIDERS;
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(body).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

/** Creates a customer-facing payment link for a product order. Amount is INR. */
export async function createOrderPaymentLink(input: { amount: number; orderNumber: string; name?: string | null; email?: string | null; phone: string }) {
  if (env.MOCK_PROVIDERS) {
    return { id: `mock_order_pl_${input.orderNumber}`, short_url: `${env.WEB_URL}/checkout?order=${encodeURIComponent(input.orderNumber)}&mock=1`, amount: Math.round(input.amount * 100), currency: 'INR', status: 'created' };
  }
  if (!rp) throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  return (rp as any).paymentLink.create({
    amount: Math.round(input.amount * 100), currency: 'INR', accept_partial: false,
    reference_id: input.orderNumber, description: `Amrit Vela Trust order ${input.orderNumber}`,
    customer: { name: input.name || 'Customer', email: input.email || undefined, contact: input.phone },
    notify: { sms: false, email: false }, reminder_enable: true, notes: { orderNumber: input.orderNumber },
  });
}

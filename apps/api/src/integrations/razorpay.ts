import Razorpay from 'razorpay';
import crypto from 'crypto';
import { env } from '../config';

const rp = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
  : null;

/** A Razorpay account other than the main one (a trust's own keys). `undefined`/null = the main account from the environment. */
export type RzpAccount = { keyId: string; keySecret: string } | null | undefined;
const extraClients = new Map<string, any>();
function clientFor(account: RzpAccount): any {
  if (!account) return rp;
  const id = `${account.keyId}:${crypto.createHash('sha256').update(account.keySecret).digest('hex').slice(0, 12)}`;
  let c = extraClients.get(id);
  if (!c) { c = new Razorpay({ key_id: account.keyId, key_secret: account.keySecret }); extraClients.set(id, c); }
  return c;
}

/** Cheap read-only call that proves a key pair is valid (used by the admin "Test connection" button). */
export async function testRazorpayAccount(account: RzpAccount): Promise<{ ok: boolean; message: string }> {
  if (env.MOCK_PROVIDERS && !account) return { ok: true, message: 'Mock mode: no real Razorpay account is used.' };
  const client = clientFor(account);
  if (!client) return { ok: false, message: 'The main Razorpay account is not configured on the server (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).' };
  try { await client.paymentLink.all({ count: 1 }); return { ok: true, message: 'Connected. These keys work.' }; }
  catch (e: any) {
    const code = e?.statusCode || e?.error?.statusCode;
    const desc = e?.error?.description || e?.message || 'Unknown error';
    return { ok: false, message: code === 401 || /authentication/i.test(desc) ? 'Razorpay rejected these keys (authentication failed). Check the Key ID and Key Secret, and that they are Live keys if you are accepting real money.' : `Razorpay error: ${desc}` };
  }
}

export async function createPayment(amount: number, receipt: string, account?: RzpAccount) {
  if (env.MOCK_PROVIDERS) return { id: `mock_${receipt}`, amount, currency: 'INR', receipt };
  const rp = clientFor(account);
  if (!rp) throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or enable MOCK_PROVIDERS only for testing.');
  return rp.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt });
}

/** Creates a customer-facing Razorpay Payment Link (amount is INR). */
export async function createDonationPaymentLink(input: {
  amount: number; reference: string; donationId: string; name?: string | null;
  email?: string | null; phone: string; campaignTitle?: string | null; trustName?: string | null; account?: RzpAccount;
}) {
  if (env.MOCK_PROVIDERS) {
    return { id: `mock_pl_${input.reference}`, short_url: `${env.WEB_URL}/donate?reference=${encodeURIComponent(input.reference)}&mock=1`, amount: Math.round(input.amount * 100), currency: 'INR', status: 'created', notes: { donationId: input.donationId, reference: input.reference } };
  }
  const client = clientFor(input.account);
  if (!client) throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  return client.paymentLink.create({
    amount: Math.round(input.amount * 100),
    currency: 'INR',
    accept_partial: false,
    reference_id: input.reference,
    description: `Donation to ${input.trustName || 'Amrit Vela Trust'}${input.campaignTitle ? ` — ${input.campaignTitle}` : ''} (${input.reference})`.slice(0, 2000),
    customer: { name: input.name || 'Donor', email: input.email || undefined, contact: input.phone },
    notify: { sms: false, email: false },
    reminder_enable: true,
    notes: { donationId: input.donationId, reference: input.reference },
  });
}

export type ProviderPaymentState = {
  state: 'paid' | 'unpaid' | 'expired' | 'cancelled' | 'unknown';
  paymentId?: string;
  amountPaidPaise: number;
  currency?: string;
  detail?: string;
};

/**
 * Asks Razorpay directly whether a stored checkout identifier has been paid.
 * `id` is a Payment Link ID (plink_...) or a Standard Checkout Order ID (order_...).
 * This is the source of truth used when a webhook was missed or never configured.
 */
export async function fetchProviderPaymentState(id: string, account?: RzpAccount): Promise<ProviderPaymentState> {
  if (!id || id.startsWith('mock_')) return { state: 'unknown', amountPaidPaise: 0, detail: 'mock or missing id' };
  const client = clientFor(account);
  if (!client) return { state: 'unknown', amountPaidPaise: 0, detail: 'razorpay not configured' };
  try {
    if (id.startsWith('plink_')) {
      const link = await client.paymentLink.fetch(id);
      const payments: any[] = Array.isArray(link?.payments) ? link.payments : [];
      const good = payments.find((p) => ['captured', 'paid'].includes(String(p?.status).toLowerCase())) || payments[0];
      const amountPaidPaise = Number(link?.amount_paid || 0);
      const status = String(link?.status || '').toLowerCase();
      const paymentId = good?.payment_id ? String(good.payment_id) : undefined;
      if (status === 'paid' || (amountPaidPaise > 0 && amountPaidPaise >= Number(link?.amount || Infinity))) {
        return { state: 'paid', paymentId, amountPaidPaise, currency: link?.currency, detail: status };
      }
      if (status === 'expired') return { state: 'expired', amountPaidPaise, detail: status };
      if (status === 'cancelled') return { state: 'cancelled', amountPaidPaise, detail: status };
      return { state: 'unpaid', amountPaidPaise, currency: link?.currency, detail: status };
    }
    if (id.startsWith('order_')) {
      const order = await client.orders.fetch(id);
      const amountPaidPaise = Number(order?.amount_paid || 0);
      if (String(order?.status).toLowerCase() === 'paid' || (amountPaidPaise > 0 && amountPaidPaise >= Number(order?.amount || Infinity))) {
        let paymentId: string | undefined;
        try {
          const list = await client.orders.fetchPayments(id);
          const captured = (list?.items || []).find((p: any) => String(p?.status).toLowerCase() === 'captured');
          paymentId = captured?.id ? String(captured.id) : undefined;
        } catch (e: any) { console.error('[RAZORPAY] fetchPayments failed:', e?.error?.description || e?.message || e); }
        return { state: 'paid', paymentId, amountPaidPaise, currency: order?.currency, detail: order?.status };
      }
      return { state: 'unpaid', amountPaidPaise, detail: order?.status };
    }
    return { state: 'unknown', amountPaidPaise: 0, detail: `unrecognised id format: ${id}` };
  } catch (e: any) {
    const detail = e?.error?.description || e?.message || String(e);
    console.error('[RAZORPAY] fetchProviderPaymentState failed for', id, detail);
    return { state: 'unknown', amountPaidPaise: 0, detail };
  }
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, account?: RzpAccount) {
  const secret = account ? account.keySecret : env.RAZORPAY_KEY_SECRET;
  if (!secret) return env.MOCK_PROVIDERS;
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

/** Checks a webhook signature against the main webhook secret and, optionally, other accounts' webhook secrets. */
export function verifySignature(body: string, signature: string, extraSecrets: string[] = []) {
  const secrets = [env.RAZORPAY_WEBHOOK_SECRET, ...extraSecrets].filter((x): x is string => Boolean(x));
  // Never accept unsigned Razorpay webhooks in production.
  if (!secrets.length) return env.NODE_ENV !== 'production' && env.MOCK_PROVIDERS;
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const received = Buffer.from(signature, 'hex');
  return secrets.some((secret) => {
    const expected = crypto.createHmac('sha256', secret).update(body).digest();
    return received.length === expected.length && crypto.timingSafeEqual(expected, received);
  });
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
    expire_by: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
  });
}

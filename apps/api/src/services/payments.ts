import { db } from '../db';
import { env } from '../config';
import { fetchProviderPaymentState, type ProviderPaymentState } from '../integrations/razorpay';
import { sendWhatsAppPdf, sendWhatsAppDocument, sendWhatsAppText } from '../integrations/whatsapp';
import { makeReceipt } from './receipt';
import { markOrderPaid } from './fulfillment';

/* ------------------------------------------------------------------ donations */

/** Marks a donation PAID exactly once. Returns true only for the call that performed the transition. */
export async function markDonationPaid(donationId: string, paymentId?: string | null): Promise<boolean> {
  const claim = await db.donation.updateMany({
    where: { id: donationId, paymentStatus: { in: ['PENDING', 'FAILED'] } },
    data: { paymentStatus: 'PAID', razorpayPaymentId: paymentId || undefined, paidAt: new Date() },
  });
  if (claim.count > 0) {
    console.log(`[PAYMENTS] Donation ${donationId} marked PAID (payment ${paymentId || 'n/a'})`);
    await db.donation.update({ where: { id: donationId }, data: { receiptUrl: `${env.API_URL}/api/donations/${donationId}/receipt` } }).catch(() => undefined);
  }
  return claim.count > 0;
}

/** Generates and sends only the PDF (no intro text). Falls back to a link-based document, then throws. */
export async function sendReceiptPdf(donationId: string): Promise<void> {
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { user: true } });
  if (!d || d.paymentStatus !== 'PAID') throw new Error('Receipt is available only for PAID donations');
  const pdf = await makeReceipt({
    reference: d.reference, name: d.user.name, amount: d.amount, status: d.paymentStatus,
    paymentId: d.razorpayPaymentId, paidAt: d.paidAt, phone: d.user.phone,
  });
  try {
    await sendWhatsAppPdf(d.user.phone, pdf, `${d.reference}.pdf`, `Donation receipt ${d.reference}`);
  } catch (uploadError) {
    console.error('[RECEIPT] PDF upload failed, falling back to link delivery:', (uploadError as any)?.message || uploadError);
    await sendWhatsAppDocument(d.user.phone, `${env.API_URL}/api/donations/${d.id}/receipt`, `${d.reference}.pdf`);
  }
  await db.donation.update({ where: { id: d.id }, data: { receiptSentAt: new Date() } });
}

/**
 * Sends "thank you" + the PDF receipt for a PAID donation exactly once
 * (claims receiptSentAt first, so webhook + sweeper racing cannot double-send).
 * On failure the claim is released so the sweeper / a later "receipt" request can retry.
 */
export async function deliverDonationReceipt(donationId: string): Promise<boolean> {
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { user: true } });
  if (!d || d.paymentStatus !== 'PAID') return false;
  const claim = await db.donation.updateMany({ where: { id: d.id, receiptSentAt: null }, data: { receiptSentAt: new Date() } });
  if (claim.count === 0) return false;
  try {
    await sendWhatsAppText(d.user.phone, `Dhanyavaad! Aapka ₹${d.amount.toLocaleString('en-IN')} ka donation confirm ho gaya hai.\nReference: ${d.reference}\nAapki PDF receipt neeche bheji ja rahi hai.`);
    await sendReceiptPdf(d.id);
    return true;
  } catch (e: any) {
    console.error('[RECEIPT] Delivery failed for', d.reference, e?.message || e);
    await db.donation.update({ where: { id: d.id }, data: { receiptSentAt: null } }).catch(() => undefined);
    return false;
  }
}

/* ------------------------------------------------------------------ live reconciliation against Razorpay */

export type ReconcileResult = {
  kind: 'donation' | 'order';
  status: 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  /** true when THIS call flipped the record from unpaid to PAID */
  justPaid: boolean;
  /** true when Razorpay itself could not be reached/understood, so "unpaid" is not proven */
  unverified: boolean;
  provider?: ProviderPaymentState;
};

function amountOk(p: ProviderPaymentState, expectedRupees: number, currency: string) {
  return p.amountPaidPaise >= expectedRupees * 100 && (!p.currency || p.currency === currency);
}

export async function reconcileDonation(donationId: string): Promise<ReconcileResult> {
  const d = await db.donation.findUnique({ where: { id: donationId } });
  if (!d) throw new Error('Donation not found');
  if (d.paymentStatus === 'PAID') return { kind: 'donation', status: 'PAID', justPaid: false, unverified: false };
  if (!d.razorpayOrderId) return { kind: 'donation', status: 'PENDING', justPaid: false, unverified: true };

  const provider = await fetchProviderPaymentState(d.razorpayOrderId);
  if (provider.state === 'paid') {
    if (!amountOk(provider, d.amount, d.currency)) {
      console.error(`[RECONCILE] Donation ${d.reference}: Razorpay paid ${provider.amountPaidPaise} paise but expected ${d.amount * 100}. NOT marking paid.`);
      return { kind: 'donation', status: 'PENDING', justPaid: false, unverified: true, provider };
    }
    const justPaid = await markDonationPaid(d.id, provider.paymentId);
    return { kind: 'donation', status: 'PAID', justPaid, unverified: false, provider };
  }
  const status = provider.state === 'expired' ? 'EXPIRED' : provider.state === 'cancelled' ? 'CANCELLED' : 'PENDING';
  return { kind: 'donation', status, justPaid: false, unverified: provider.state === 'unknown', provider };
}

export async function reconcileOrder(orderId: string): Promise<ReconcileResult> {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o) throw new Error('Order not found');
  if (o.paymentStatus === 'PAID') return { kind: 'order', status: 'PAID', justPaid: false, unverified: false };
  if (!o.razorpayOrderId) return { kind: 'order', status: 'PENDING', justPaid: false, unverified: true };

  const provider = await fetchProviderPaymentState(o.razorpayOrderId);
  if (provider.state === 'paid') {
    if (!amountOk(provider, o.total, o.currency)) {
      console.error(`[RECONCILE] Order ${o.orderNumber}: Razorpay paid ${provider.amountPaidPaise} paise but expected ${o.total * 100}. NOT marking paid.`);
      return { kind: 'order', status: 'PENDING', justPaid: false, unverified: true, provider };
    }
    const before = await db.order.findUnique({ where: { id: o.id }, select: { paymentStatus: true } });
    await markOrderPaid(o.id, provider.paymentId || '');
    return { kind: 'order', status: 'PAID', justPaid: before?.paymentStatus !== 'PAID', unverified: false, provider };
  }
  const status = provider.state === 'expired' ? 'EXPIRED' : provider.state === 'cancelled' ? 'CANCELLED' : 'PENDING';
  return { kind: 'order', status, justPaid: false, unverified: provider.state === 'unknown', provider };
}

/* ------------------------------------------------------------------ periodic safety net */

let sweeping = false;

/**
 * Re-checks recent unpaid donations/orders directly with Razorpay and retries undelivered receipts.
 * This guarantees "paid in Razorpay" eventually becomes "PAID in our DB + receipt on WhatsApp"
 * even if a webhook was never delivered, was misconfigured, or arrived before the record was linked.
 */
export async function sweepPendingPayments(reason = 'interval'): Promise<{ donations: number; orders: number; receipts: number }> {
  if (sweeping) return { donations: 0, orders: 0, receipts: 0 };
  sweeping = true;
  const result = { donations: 0, orders: 0, receipts: 0 };
  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const minAge = new Date(Date.now() - 20 * 1000);

    const pendingDonations = await db.donation.findMany({
      where: { paymentStatus: { in: ['PENDING', 'FAILED'] }, razorpayOrderId: { not: null }, createdAt: { gte: since, lte: minAge } },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    for (const d of pendingDonations) {
      try {
        const r = await reconcileDonation(d.id);
        if (r.justPaid) { result.donations++; console.log(`[SWEEP:${reason}] Donation ${d.reference} reconciled to PAID`); }
      } catch (e: any) { console.error('[SWEEP] donation error', d.reference, e?.message || e); }
    }

    const pendingOrders = await db.order.findMany({
      where: { paymentStatus: { in: ['PENDING', 'FAILED'] }, status: { not: 'CANCELLED' }, razorpayOrderId: { not: null }, createdAt: { gte: since, lte: minAge } },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
    for (const o of pendingOrders) {
      try {
        const r = await reconcileOrder(o.id);
        if (r.justPaid) { result.orders++; console.log(`[SWEEP:${reason}] Order ${o.orderNumber} reconciled to PAID`); }
      } catch (e: any) { console.error('[SWEEP] order error', o.orderNumber, e?.message || e); }
    }

    // Receipts that were never delivered (e.g. WhatsApp outage when the webhook fired).
    const undelivered = await db.donation.findMany({
      where: { paymentStatus: 'PAID', receiptSentAt: null, paidAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      take: 25,
    });
    for (const d of undelivered) {
      if (await deliverDonationReceipt(d.id)) result.receipts++;
    }
  } catch (e: any) {
    console.error('[SWEEP] failed:', e?.message || e);
  } finally {
    sweeping = false;
  }
  return result;
}

export function startPaymentSweeper() {
  if (!env.RECONCILE_INTERVAL_MS) { console.warn('[SWEEP] disabled (RECONCILE_INTERVAL_MS=0)'); return; }
  if (env.MOCK_PROVIDERS) { console.warn('[SWEEP] not started in mock mode'); return; }
  setTimeout(() => void sweepPendingPayments('startup'), 15_000).unref();
  setInterval(() => void sweepPendingPayments('interval'), env.RECONCILE_INTERVAL_MS).unref();
  console.log(`[SWEEP] payment reconciliation every ${Math.round(env.RECONCILE_INTERVAL_MS / 1000)}s`);
}

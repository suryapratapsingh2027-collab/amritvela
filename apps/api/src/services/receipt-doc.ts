import { db } from '../db';
import { makeReceipt } from './receipt';
import { ensureReceiptNumber } from './receipt-number';

/** The one place that builds a donation receipt PDF (WhatsApp, website download and admin download/resend all use it). */
export async function buildDonationReceipt(donationId: string) {
  const number = await ensureReceiptNumber(donationId);
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { user: true, campaign: { select: { title: true } } } });
  if (!d || d.paymentStatus !== 'PAID') throw new Error('Receipts are available only for verified (PAID) donations.');
  const pdf = await makeReceipt({
    reference: d.reference, receiptNumber: number ?? d.receiptNumber, name: d.user.name, amount: d.amount, status: d.paymentStatus,
    paymentId: d.razorpayPaymentId, paidAt: d.paidAt, phone: d.user.phone, email: d.user.email, campaign: d.campaign?.title ?? null,
  });
  const fileName = `${(number ?? d.receiptNumber ?? d.reference).replace(/[\\/]/g, '-')}.pdf`;
  return { pdf, fileName, donation: d, receiptNumber: number ?? d.receiptNumber };
}

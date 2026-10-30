import { db } from '../db';
import { createDonationPaymentLink } from '../integrations/razorpay';
import { sendWhatsAppText } from '../integrations/whatsapp';
import { MAX_DONATION, MIN_DONATION } from './bot-nlp';
import { normalizeLang, t, type Lang } from '../i18n';

/**
 * Creates the Donation row + Razorpay Payment Link. Does NOT send anything to WhatsApp, so the caller
 * can decide how to reply and a send failure can never cause a second donation to be created.
 * If Razorpay fails, the donation row is marked FAILED (never left as a phantom PENDING) and the error is rethrown.
 */
export async function createDonationLink(input: { phone: string; name?: string | null; email?: string | null; amount: number; lang?: Lang | null }) {
  const amount = Math.round(Number(input.amount));
  if (!input.phone || !Number.isSafeInteger(amount) || amount < MIN_DONATION || amount > MAX_DONATION) {
    throw new Error('Valid phone and donation amount (₹1–₹1,00,00,000) are required.');
  }
  const user = await db.user.upsert({
    where: { phone: input.phone },
    update: { ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email } : {}) },
    create: { phone: input.phone, name: input.name || undefined, email: input.email || undefined },
  });
  const reference = `DON-${Date.now()}-${Math.floor(Math.random() * 90000 + 10000)}`;
  const donation = await db.donation.create({ data: { reference, userId: user.id, amount } });
  try {
    const link: any = await createDonationPaymentLink({ amount, reference, donationId: donation.id, name: user.name, email: user.email, phone: user.phone });
    const url = String(link?.short_url || '');
    if (!link?.id || !url) throw new Error('Razorpay did not return a Payment Link URL.');
    // razorpayOrderId stores the provider checkout identifier (Payment Link ID here; Order ID for website checkout).
    await db.donation.update({ where: { id: donation.id }, data: { razorpayOrderId: String(link.id) } });
    const message = t(input.lang ?? normalizeLang(user.language), 'donate_link', { name: user.name ? ` ${user.name}` : '', amount: amount.toLocaleString('en-IN'), url, ref: donation.reference });
    return { donationId: donation.id, reference, amount, paymentLinkId: String(link.id), paymentUrl: url, message, mock: String(link.id).startsWith('mock_') };
  } catch (error) {
    await db.donation.update({ where: { id: donation.id }, data: { paymentStatus: 'FAILED' } }).catch(() => undefined);
    throw error;
  }
}

/** Admin/API helper: create the link and push it to the donor's WhatsApp. */
export async function createAndSendDonationLink(input: { phone: string; name?: string | null; email?: string | null; amount: number; lang?: Lang | null }) {
  const result = await createDonationLink(input);
  await sendWhatsAppText(input.phone, result.message);
  return result;
}

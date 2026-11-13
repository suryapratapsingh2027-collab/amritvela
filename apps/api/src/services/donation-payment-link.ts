import { db } from '../db';
import { createDonationPaymentLink } from '../integrations/razorpay';
import { sendWhatsAppText } from '../integrations/whatsapp';
import { MAX_DONATION, MIN_DONATION } from './bot-nlp';
import { normalizeLang, t, type Lang } from '../i18n';
import { isAcceptingDonations } from './campaigns';
import { paymentAccount, type TrustPayRow } from './trust-accounts';

/**
 * Creates the Donation row + Razorpay Payment Link. Does NOT send anything to WhatsApp, so the caller
 * can decide how to reply and a send failure can never cause a second donation to be created.
 * If Razorpay fails, the donation row is marked FAILED (never left as a phantom PENDING) and the error is rethrown.
 */
export type DonationLinkInput = { phone: string; name?: string | null; email?: string | null; amount: number; lang?: Lang | null; campaignId?: string | null; trustId?: string | null };

export async function createDonationLink(input: DonationLinkInput) {
  const amount = Math.round(Number(input.amount));
  if (!input.phone || !Number.isSafeInteger(amount) || amount < MIN_DONATION || amount > MAX_DONATION) {
    throw new Error('Valid phone and donation amount (₹1–₹1,00,00,000) are required.');
  }
  const user = await db.user.upsert({
    where: { phone: input.phone },
    update: { ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email } : {}) },
    create: { phone: input.phone, name: input.name || undefined, email: input.email || undefined },
  });
  let campaign: { id: string; title: string } | null = null;
  if (input.campaignId) {
    const c = await db.campaign.findUnique({ where: { id: input.campaignId } });
    if (!c || !isAcceptingDonations(c)) throw Object.assign(new Error('This campaign is not accepting donations right now.'), { code: 'CAMPAIGN_CLOSED' });
    campaign = { id: c.id, title: c.title };
    // A campaign can be tied to a trust: its money then goes to that trust's account.
    if (!input.trustId && c.trustId) input = { ...input, trustId: c.trustId };
  }
  // Which trust (and therefore which Razorpay account) receives this donation. No trust = the main account.
  let trust: (TrustPayRow & { active: boolean }) | null = null;
  if (input.trustId) {
    trust = (await db.trust.findUnique({ where: { id: input.trustId } })) as any;
    if (!trust || !trust.active) throw Object.assign(new Error('This trust is not accepting donations right now.'), { code: 'TRUST_CLOSED' });
  }
  const pay = paymentAccount(trust);
  if (!pay.link) throw Object.assign(new Error(pay.reason || 'This trust accepts donations by QR / UPI only.'), { code: 'NO_PAYMENT_LINK', trustSlug: trust?.slug });
  const reference = `DON-${Date.now()}-${Math.floor(Math.random() * 90000 + 10000)}`;
  const donation = await db.donation.create({ data: { reference, userId: user.id, amount, campaignId: campaign?.id ?? null, trustId: trust?.id ?? null } });
  try {
    const link: any = await createDonationPaymentLink({ amount, reference, donationId: donation.id, name: user.name, email: user.email, phone: user.phone, campaignTitle: campaign?.title ?? null, trustName: trust?.name ?? null, account: pay.account });
    const url = String(link?.short_url || '');
    if (!link?.id || !url) throw new Error('Razorpay did not return a Payment Link URL.');
    // razorpayOrderId stores the provider checkout identifier (Payment Link ID here; Order ID for website checkout).
    await db.donation.update({ where: { id: donation.id }, data: { razorpayOrderId: String(link.id) } });
    const vars = { name: user.name ? ` ${user.name}` : '', amount: amount.toLocaleString('en-IN'), url, ref: donation.reference, campaign: campaign?.title ?? '', trust: trust?.name ?? '' };
    const message = t(input.lang ?? normalizeLang(user.language), campaign ? 'donate_link_campaign' : trust ? 'donate_link_trust' : 'donate_link', vars);
    return { donationId: donation.id, reference, amount, trustId: trust?.id ?? null, trustSlug: trust?.slug ?? null, paymentLinkId: String(link.id), paymentUrl: url, message, mock: String(link.id).startsWith('mock_') };
  } catch (error) {
    await db.donation.update({ where: { id: donation.id }, data: { paymentStatus: 'FAILED' } }).catch(() => undefined);
    throw error;
  }
}

/** Admin/API helper: create the link and push it to the donor's WhatsApp. */
export async function createAndSendDonationLink(input: DonationLinkInput) {
  const result = await createDonationLink(input);
  await sendWhatsAppText(input.phone, result.message);
  return result;
}

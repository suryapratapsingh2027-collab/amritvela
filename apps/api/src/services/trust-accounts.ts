import { db } from '../db';
import { env } from '../config';
import { openSecret } from '../utils/secret-box';
import type { RzpAccount } from '../integrations/razorpay';

export type TrustPayRow = {
  id: string; slug: string; name: string; accountMode: string; offerQr: boolean;
  razorpayKeyId: string | null; razorpayKeySecretEnc: string | null; qrImageUrl: string | null; upiId: string | null;
};

export const ACCOUNT_MODES = ['DEFAULT', 'OWN', 'QR_ONLY'] as const;
export type AccountMode = (typeof ACCOUNT_MODES)[number];

/** Where an online payment link for this trust is created. `null` trust = the Trust's main account. */
export function paymentAccount(trust: TrustPayRow | null | undefined): { link: boolean; account: RzpAccount; reason?: string } {
  if (!trust || trust.accountMode === 'DEFAULT') return { link: true, account: null };
  if (trust.accountMode === 'OWN') {
    const secret = openSecret(trust.razorpayKeySecretEnc);
    if (trust.razorpayKeyId && secret) return { link: true, account: { keyId: trust.razorpayKeyId, keySecret: secret } };
    return { link: false, account: null, reason: 'This trust has no working Razorpay keys saved.' };
  }
  return { link: false, account: null };
}

export const hasQr = (t: { qrImageUrl: string | null; upiId: string | null } | null | undefined) => Boolean(t && (t.qrImageUrl || t.upiId));

/** Razorpay account that must be used to check / verify a donation (follows the trust the donation was made to). */
export async function accountForDonation(donation: { trustId?: string | null }): Promise<RzpAccount> {
  if (!donation.trustId) return null;
  const t = await db.trust.findUnique({ where: { id: donation.trustId } });
  const p = paymentAccount(t as TrustPayRow | null);
  return p.link ? p.account : null;
}

/** Webhook secrets of every trust that has its own Razorpay account (the single webhook URL accepts all of them). */
export async function extraWebhookSecrets(): Promise<string[]> {
  const rows = await db.trust.findMany({ where: { accountMode: 'OWN', razorpayWebhookSecretEnc: { not: null } }, select: { razorpayWebhookSecretEnc: true } });
  return rows.map((r) => openSecret(r.razorpayWebhookSecretEnc)).filter((x): x is string => Boolean(x));
}

export const mainAccountConfigured = () => Boolean(env.MOCK_PROVIDERS || (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET));

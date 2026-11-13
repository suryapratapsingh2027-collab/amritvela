import { db } from '../db';
import { env } from '../config';

export type SocialLinks = { instagram?: string; facebook?: string; youtube?: string; whatsappGroup?: string; whatsappChannel?: string };
export const SOCIAL_FIELDS = ['instagram', 'facebook', 'youtube', 'whatsappGroup', 'whatsappChannel'] as const;
export type SocialField = (typeof SOCIAL_FIELDS)[number];

const KEY: Record<SocialField, string> = { instagram: 'social.instagram', facebook: 'social.facebook', youtube: 'social.youtube', whatsappGroup: 'social.whatsappGroup', whatsappChannel: 'social.whatsappChannel' };
const ENV_FALLBACK: Record<SocialField, string | undefined> = {
  instagram: env.TRUST_INSTAGRAM_URL, facebook: env.TRUST_FACEBOOK_URL, youtube: env.TRUST_YOUTUBE_URL, whatsappGroup: env.TRUST_WHATSAPP_COMMUNITY_URL, whatsappChannel: undefined,
};

/** Hosts each link must point to, so a wrong paste (e.g. a Facebook link in the Instagram box) is caught. */
const HOSTS: Record<SocialField, RegExp> = {
  instagram: /(^|\.)instagram\.com$/i,
  facebook: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/i,
  whatsappGroup: /(^|\.)(chat\.whatsapp\.com|whatsapp\.com|wa\.me)$/i,
  whatsappChannel: /(^|\.)(whatsapp\.com|wa\.me)$/i,
};
export const SOCIAL_LABEL: Record<SocialField, string> = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', whatsappGroup: 'WhatsApp group', whatsappChannel: 'WhatsApp channel' };

/** Returns an error sentence, or null when the link is acceptable. */
export function validateSocialUrl(field: SocialField, value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return `${SOCIAL_LABEL[field]}: enter a full link starting with https://`; }
  if (url.protocol !== 'https:') return `${SOCIAL_LABEL[field]}: the link must start with https://`;
  if (!HOSTS[field].test(url.hostname)) return `${SOCIAL_LABEL[field]}: this does not look like a ${SOCIAL_LABEL[field]} link (${url.hostname}).`;
  return null;
}

/** Admin-saved links, falling back to the optional TRUST_*_URL environment variables. */
export async function getSocialLinks(): Promise<SocialLinks> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(KEY) } } });
  const out: SocialLinks = {};
  for (const f of SOCIAL_FIELDS) {
    const stored = rows.find((r) => r.key === KEY[f])?.value;
    const value = stored || ENV_FALLBACK[f];
    if (value) out[f] = value;
  }
  return out;
}

/** An empty string removes that link. */
export async function saveSocialLinks(input: Partial<Record<SocialField, string>>) {
  for (const f of SOCIAL_FIELDS) {
    if (input[f] === undefined) continue;
    const v = input[f]!.trim();
    if (!v) await db.setting.deleteMany({ where: { key: KEY[f] } });
    else await db.setting.upsert({ where: { key: KEY[f] }, update: { value: v }, create: { key: KEY[f], value: v } });
  }
}

import { db } from '../db';
import type { Lang } from '../i18n';

export type CampaignRow = {
  id: string; slug: string; title: string; status: string; descriptionEn: string; descriptionHi: string | null; descriptionHing: string | null; descriptionPa: string | null; descriptionMr?: string | null;
  imageUrl: string | null; targetAmount: number; startsAt: Date | null; endsAt: Date | null; sortOrder: number; createdAt: Date;
};

/** ACTIVE / PAUSED / COMPLETED as set by the admin, plus ENDED (end date passed) and UPCOMING (start date in the future). */
export function effectiveStatus(c: Pick<CampaignRow, 'status' | 'startsAt' | 'endsAt'>, now = new Date()): 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ENDED' | 'UPCOMING' {
  if (c.status === 'PAUSED') return 'PAUSED';
  if (c.status === 'COMPLETED') return 'COMPLETED';
  if (c.endsAt && c.endsAt.getTime() < now.getTime()) return 'ENDED';
  if (c.startsAt && c.startsAt.getTime() > now.getTime()) return 'UPCOMING';
  return 'ACTIVE';
}

export const isAcceptingDonations = (c: Pick<CampaignRow, 'status' | 'startsAt' | 'endsAt'>, now = new Date()) => effectiveStatus(c, now) === 'ACTIVE';

export function descriptionFor(c: Pick<CampaignRow, 'descriptionEn' | 'descriptionHi' | 'descriptionHing' | 'descriptionPa' | 'descriptionMr'>, lang: Lang | null | undefined): string {
  const pick = lang === 'hi' ? c.descriptionHi : lang === 'hing' ? c.descriptionHing : lang === 'pa' ? c.descriptionPa : lang === 'mr' ? c.descriptionMr : null;
  return (pick?.trim() || c.descriptionEn).trim();
}

/** Money raised (verified payments only) and number of donors per campaign. */
export async function campaignStats(ids: string[]): Promise<Map<string, { raised: number; donations: number; donors: number }>> {
  const out = new Map<string, { raised: number; donations: number; donors: number }>();
  if (!ids.length) return out;
  const sums = await db.donation.groupBy({ by: ['campaignId'], where: { paymentStatus: 'PAID', campaignId: { in: ids } }, _sum: { amount: true }, _count: { _all: true } });
  const donors = await db.donation.groupBy({ by: ['campaignId', 'userId'], where: { paymentStatus: 'PAID', campaignId: { in: ids } } });
  for (const id of ids) out.set(id, { raised: 0, donations: 0, donors: 0 });
  for (const s of sums) if (s.campaignId) out.get(s.campaignId)!.raised = s._sum.amount ?? 0, out.get(s.campaignId)!.donations = s._count._all;
  for (const d of donors) if (d.campaignId) out.get(d.campaignId)!.donors++;
  return out;
}

export type CampaignView = ReturnType<typeof toView>;
export function toView(c: CampaignRow, stats: { raised: number; donations: number; donors: number }, now = new Date()) {
  const percent = c.targetAmount > 0 ? Math.min(100, Math.floor((stats.raised / c.targetAmount) * 100)) : 0;
  const daysLeft = c.endsAt ? Math.max(0, Math.ceil((c.endsAt.getTime() - now.getTime()) / 86_400_000)) : null;
  return { ...c, effectiveStatus: effectiveStatus(c, now), raised: stats.raised, donations: stats.donations, donors: stats.donors, percent, goalReached: stats.raised >= c.targetAmount, daysLeft };
}

export async function listCampaignViews(where: object = {}): Promise<CampaignView[]> {
  const rows = (await db.campaign.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] })) as CampaignRow[];
  const stats = await campaignStats(rows.map((r) => r.id));
  return rows.map((r) => toView(r, stats.get(r.id) ?? { raised: 0, donations: 0, donors: 0 }));
}

/** Campaigns a donor may currently give to. */
export async function activeCampaignViews(): Promise<CampaignView[]> {
  return (await listCampaignViews({ status: 'ACTIVE' })).filter((c) => c.effectiveStatus === 'ACTIVE');
}

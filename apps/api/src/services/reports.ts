import { Prisma } from '@prisma/client';
import { db } from '../db';
import { addDays, financialYearStart, istParts, istStartOfDay } from './time';

const IST = Prisma.sql`("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'`;

type Point = { key: string; total: number; count: number };

async function series(format: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY', from: Date): Promise<Map<string, Point>> {
  const rows = await db.$queryRaw<{ k: string; total: bigint | number; count: bigint | number }[]>(Prisma.sql`
    SELECT to_char(${IST}, ${format}) AS k, COALESCE(SUM("amount"), 0) AS total, COUNT(*) AS count
    FROM "Donation" WHERE "paymentStatus" = 'PAID' AND "paidAt" >= ${from}
    GROUP BY 1 ORDER BY 1`);
  return new Map(rows.map((r) => [r.k, { key: r.k, total: Number(r.total), count: Number(r.count) }]));
}

const paidBetween = async (gte: Date, lt?: Date) => {
  const r = await db.donation.aggregate({ where: { paymentStatus: 'PAID', paidAt: { gte, ...(lt ? { lt } : {}) } }, _sum: { amount: true }, _count: { _all: true } });
  return { total: r._sum.amount ?? 0, count: r._count._all };
};

/** Everything the admin dashboard needs in one call. All day/month boundaries are India time. */
export async function donationDashboard(now = new Date()) {
  const t = istParts(now);
  const startToday = istStartOfDay(t.ymd);
  const monthKey = `${t.year}-${String(t.month).padStart(2, '0')}`;
  const startMonth = istStartOfDay(`${monthKey}-01`);
  const startYear = istStartOfDay(`${t.year}-01-01`);
  const prevMonthYmd = `${t.month === 1 ? t.year - 1 : t.year}-${String(t.month === 1 ? 12 : t.month - 1).padStart(2, '0')}-01`;
  const startPrevMonth = istStartOfDay(prevMonthYmd);

  const [all, today, month, prevMonth, year, fy, pending, failed, donors, byCampaignRaw, recent] = await Promise.all([
    db.donation.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { amount: true }, _count: { _all: true }, _avg: { amount: true } }),
    paidBetween(startToday), paidBetween(startMonth), paidBetween(startPrevMonth, startMonth), paidBetween(startYear), paidBetween(financialYearStart(now)),
    db.donation.aggregate({ where: { paymentStatus: 'PENDING', createdAt: { gte: new Date(now.getTime() - 3 * 86_400_000) } }, _sum: { amount: true }, _count: { _all: true } }),
    db.donation.aggregate({ where: { paymentStatus: 'FAILED' }, _count: { _all: true } }),
    db.donation.groupBy({ by: ['userId'], where: { paymentStatus: 'PAID' } }),
    db.donation.groupBy({ by: ['campaignId'], where: { paymentStatus: 'PAID', campaignId: { not: null } }, _sum: { amount: true }, _count: { _all: true }, orderBy: { _sum: { amount: 'desc' } }, take: 5 }),
    db.donation.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { user: { select: { id: true, name: true, phone: true } }, campaign: { select: { title: true } } } }),
  ]);

  // Daily (last 30 days), monthly (last 12 months), yearly (all years) — zero-filled so charts have no holes.
  const dayFrom = istStartOfDay(addDays(t.ymd, -29));
  const days = await series('YYYY-MM-DD', dayFrom);
  const daily: Point[] = [];
  for (let i = 29; i >= 0; i--) { const k = addDays(t.ymd, -i); daily.push(days.get(k) ?? { key: k, total: 0, count: 0 }); }

  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) { const idx = t.year * 12 + (t.month - 1) - i; monthKeys.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`); }
  const months = await series('YYYY-MM', istStartOfDay(`${monthKeys[0]}-01`));
  const monthly = monthKeys.map((k) => months.get(k) ?? { key: k, total: 0, count: 0 });

  const years = await series('YYYY', new Date(0));
  const yearly = [...years.values()].sort((a, b) => a.key.localeCompare(b.key));

  const campaignIds = byCampaignRaw.map((r) => r.campaignId!).filter(Boolean);
  const campaigns = campaignIds.length ? await db.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, title: true, targetAmount: true } }) : [];
  const topCampaigns = byCampaignRaw.map((r) => { const c = campaigns.find((x) => x.id === r.campaignId); return { id: r.campaignId, title: c?.title ?? 'Campaign', target: c?.targetAmount ?? 0, raised: r._sum.amount ?? 0, donations: r._count._all }; });

  const growth = prevMonth.total > 0 ? Math.round(((month.total - prevMonth.total) / prevMonth.total) * 100) : null;
  return {
    generatedAt: now.toISOString(),
    totals: {
      allTime: { total: all._sum.amount ?? 0, count: all._count._all, average: Math.round(all._avg.amount ?? 0), donors: donors.length },
      today, month, prevMonth, year, financialYear: fy, monthGrowthPercent: growth,
      pending: { total: pending._sum.amount ?? 0, count: pending._count._all }, failed: failed._count._all,
    },
    daily, monthly, yearly, topCampaigns,
    recent: recent.map((d) => ({ id: d.id, reference: d.reference, receiptNumber: d.receiptNumber, amount: d.amount, status: d.paymentStatus, createdAt: d.createdAt, paidAt: d.paidAt, donor: d.user?.name || d.user?.phone, userId: d.userId, campaign: d.campaign?.title ?? null })),
  };
}

/* ------------------------------------------------------------------ CSV report */

const FORMULA = /^[=+\-@\t\r]/;
export const csvCell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (FORMULA.test(s)) s = `'${s}`; // spreadsheet formula-injection protection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function donationsCsv(opts: { from?: string; to?: string; status?: string; campaignId?: string }) {
  const where: Prisma.DonationWhereInput = {};
  if (opts.status && ['PAID', 'PENDING', 'FAILED'].includes(opts.status)) where.paymentStatus = opts.status as any;
  if (opts.campaignId) where.campaignId = opts.campaignId;
  const range: { gte?: Date; lt?: Date } = {};
  if (opts.from) range.gte = istStartOfDay(opts.from);
  if (opts.to) range.lt = istStartOfDay(addDays(opts.to, 1));
  if (range.gte || range.lt) where.createdAt = range;
  const rows = await db.donation.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20000, include: { user: true, campaign: { select: { title: true } } } });
  const header = ['Receipt No', 'Date (IST)', 'Reference', 'Donor name', 'Mobile', 'Email', 'Amount (INR)', 'Status', 'Payment ID', 'Campaign'];
  const fmt = (d: Date | null) => (d ? `${istParts(d).ymd} ${istParts(d).hm}` : '');
  const lines = [header.join(',')];
  for (const r of rows) lines.push([r.receiptNumber, fmt(r.paidAt ?? r.createdAt), r.reference, r.user.name, r.user.phone, r.user.email, r.amount, r.paymentStatus, r.razorpayPaymentId, r.campaign?.title].map(csvCell).join(','));
  const paid = rows.filter((r) => r.paymentStatus === 'PAID');
  return { csv: `\uFEFF${lines.join('\r\n')}\r\n`, count: rows.length, paidTotal: paid.reduce((n, r) => n + r.amount, 0), paidCount: paid.length };
}

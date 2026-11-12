import { Prisma } from '@prisma/client';
import { db } from '../db';

export type DonorSort = 'total' | 'recent' | 'name' | 'count';

/** Donor list with lifetime totals (verified payments only), searchable and sortable, computed in SQL. */
export async function listDonors(opts: { search?: string; sort?: DonorSort; minTotal?: number; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, opts.pageSize ?? 25));
  const search = (opts.search ?? '').trim();
  const like = `%${search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const filter = search ? Prisma.sql`AND (u."name" ILIKE ${like} OR u."phone" ILIKE ${like} OR u."email" ILIKE ${like})` : Prisma.empty;
  const having = opts.minTotal && opts.minTotal > 0 ? Prisma.sql`HAVING COALESCE(SUM(d."amount") FILTER (WHERE d."paymentStatus" = 'PAID'), 0) >= ${Math.floor(opts.minTotal)}` : Prisma.empty;
  const order = { total: Prisma.sql`total DESC, last_paid DESC NULLS LAST`, recent: Prisma.sql`last_paid DESC NULLS LAST, total DESC`, name: Prisma.sql`LOWER(COALESCE(u."name", u."phone")) ASC`, count: Prisma.sql`paid_count DESC, total DESC` }[opts.sort ?? 'recent'];

  const base = Prisma.sql`
    FROM "User" u JOIN "Donation" d ON d."userId" = u.id
    WHERE 1 = 1 ${filter}
    GROUP BY u.id ${having}`;
  const rows = await db.$queryRaw<any[]>(Prisma.sql`
    SELECT u.id, u."name", u."phone", u."email", u."language", u."liveAlerts",
      COUNT(d.id) FILTER (WHERE d."paymentStatus" = 'PAID') AS paid_count,
      COUNT(d.id) AS attempts,
      COALESCE(SUM(d."amount") FILTER (WHERE d."paymentStatus" = 'PAID'), 0) AS total,
      MAX(d."paidAt") AS last_paid
    ${base} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
  const countRows = await db.$queryRaw<{ n: bigint | number }[]>(Prisma.sql`SELECT COUNT(*) AS n FROM (SELECT u.id ${base}) x`);
  return {
    page, pageSize, total: Number(countRows[0]?.n ?? 0),
    donors: rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, email: r.email, language: r.language, liveAlerts: r.liveAlerts, donations: Number(r.paid_count), attempts: Number(r.attempts), totalDonated: Number(r.total), lastDonationAt: r.last_paid })),
  };
}

export async function donorProfile(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, include: { _count: { select: { orders: true, conversations: true } } } });
  if (!user) return null;
  const donations = await db.donation.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { campaign: { select: { id: true, title: true } } } });
  const paid = donations.filter((d) => d.paymentStatus === 'PAID');
  const orders = await db.order.aggregate({ where: { userId, paymentStatus: 'PAID' }, _sum: { total: true }, _count: { _all: true } });
  return {
    id: user.id, name: user.name, phone: user.phone, email: user.email, language: user.language, liveAlerts: user.liveAlerts, notes: user.notes, createdAt: user.createdAt,
    stats: {
      totalDonated: paid.reduce((n, d) => n + d.amount, 0), donations: paid.length, attempts: donations.length,
      averageDonation: paid.length ? Math.round(paid.reduce((n, d) => n + d.amount, 0) / paid.length) : 0,
      firstDonationAt: paid.length ? paid[paid.length - 1].paidAt ?? paid[paid.length - 1].createdAt : null, lastDonationAt: paid.length ? paid[0].paidAt ?? paid[0].createdAt : null,
      orders: orders._count._all, orderTotal: orders._sum.total ?? 0, conversations: user._count.conversations,
    },
    donations: donations.map((d) => ({ id: d.id, reference: d.reference, receiptNumber: d.receiptNumber, amount: d.amount, status: d.paymentStatus, createdAt: d.createdAt, paidAt: d.paidAt, paymentId: d.razorpayPaymentId, receiptSentAt: d.receiptSentAt, campaign: d.campaign?.title ?? null })),
  };
}

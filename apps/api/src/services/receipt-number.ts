import { db } from '../db';
import { financialYear } from './time';

/** Next sequential receipt number for the financial year of `date`: AVT/2026-27/000123. Atomic, safe under concurrency. */
export async function nextReceiptNumber(date = new Date()): Promise<string> {
  const fy = financialYear(date);
  const key = `receipt:${fy}`;
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `AVT/${fy}/${String(Number(rows[0].value)).padStart(6, '0')}`;
}

/** Gives a PAID donation its receipt number exactly once (idempotent). */
export async function ensureReceiptNumber(donationId: string): Promise<string | null> {
  const d = await db.donation.findUnique({ where: { id: donationId }, select: { receiptNumber: true, paymentStatus: true, paidAt: true, createdAt: true } });
  if (!d) return null;
  if (d.receiptNumber) return d.receiptNumber;
  if (d.paymentStatus !== 'PAID') return null;
  const number = await nextReceiptNumber(d.paidAt ?? d.createdAt);
  const claim = await db.donation.updateMany({ where: { id: donationId, receiptNumber: null }, data: { receiptNumber: number } });
  if (claim.count > 0) return number;
  return (await db.donation.findUnique({ where: { id: donationId }, select: { receiptNumber: true } }))?.receiptNumber ?? null;
}

/** Old PAID donations (before receipt numbers existed) get numbers in the order they were paid. */
export async function backfillReceiptNumbers(): Promise<number> {
  const rows = await db.donation.findMany({ where: { paymentStatus: 'PAID', receiptNumber: null }, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
  for (const r of rows) await ensureReceiptNumber(r.id);
  return rows.length;
}

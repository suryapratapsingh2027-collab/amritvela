/** India time helpers. The Trust works in IST, so day/month boundaries and schedules are computed in IST. */
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istParts(d: Date) {
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  const iso = x.toISOString();
  return { ymd: iso.slice(0, 10), hm: iso.slice(11, 16), dow: x.getUTCDay(), year: x.getUTCFullYear(), month: x.getUTCMonth() + 1, day: x.getUTCDate() };
}

/** The UTC instant at which the given IST calendar day (YYYY-MM-DD) starts. */
export function istStartOfDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Indian financial year label, e.g. 2026-27 (April to March). */
export function financialYear(d: Date): string {
  const { year, month } = istParts(d);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function financialYearStart(d: Date): Date {
  const { year, month } = istParts(d);
  return istStartOfDay(`${month >= 4 ? year : year - 1}-04-01`);
}

export const isHm = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

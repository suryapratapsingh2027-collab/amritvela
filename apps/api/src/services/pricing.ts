/** Single source of truth for delivery pricing (used by WhatsApp checkout and website checkout). */
import { db } from '../db';

/**
 * Delivery is set by the admin: every product has its own delivery charge (rupees per piece, 0 = free delivery),
 * and an optional store-wide "free delivery above ₹X" rule (0 = off).
 */
export const FREE_ABOVE_KEY = 'shipping.freeAbove';

export async function getFreeShippingAbove(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: FREE_ABOVE_KEY } });
  const n = Number(row?.value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
export async function setFreeShippingAbove(n: number): Promise<void> {
  if (n > 0) await db.setting.upsert({ where: { key: FREE_ABOVE_KEY }, update: { value: String(n) }, create: { key: FREE_ABOVE_KEY, value: String(n) } });
  else await db.setting.deleteMany({ where: { key: FREE_ABOVE_KEY } });
}

export function shippingFor(lines: { deliveryCharge?: number | null; qty: number }[], subtotal: number, freeAbove: number): number {
  if (freeAbove > 0 && subtotal >= freeAbove) return 0;
  return lines.reduce((n, l) => n + Math.max(0, Number(l.deliveryCharge) || 0) * l.qty, 0);
}

/** Demo rows that older deployments auto-created. They are never offered on WhatsApp. */
export const DEMO_PRODUCT_SLUGS = ['trust-cotton-bag', 'handmade-diya', 'trust-tshirt'];

/** A product can be sold on WhatsApp only if it is real: active, priced, and not a leftover demo/placeholder row. */
export function isSellable(p: { active: boolean; price: number; slug: string; name: string }): boolean {
  if (!p.active || !(p.price > 0)) return false;
  if (DEMO_PRODUCT_SLUGS.includes(p.slug)) return false;
  if (/^new product$/i.test(p.name.trim())) return false;
  return true;
}

export function money(n: number): string {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

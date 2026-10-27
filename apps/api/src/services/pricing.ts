/** Single source of truth for delivery pricing (used by WhatsApp checkout and website checkout). */
export const FREE_SHIPPING_THRESHOLD = 1000;
export const FLAT_SHIPPING_FEE = 80;

export function shippingFor(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
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

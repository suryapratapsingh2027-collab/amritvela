/**
 * Turns whatever we stored as an order address (website: plain string, WhatsApp bot: {full, pin})
 * into the structured fields Shiprocket requires: address, city, state, 6-digit pincode, 10-digit phone.
 */
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];
const STATE_ALIASES: Record<string, string> = {
  orissa: 'Odisha', 'new delhi': 'Delhi', 'j&k': 'Jammu and Kashmir', 'jammu & kashmir': 'Jammu and Kashmir', uttaranchal: 'Uttarakhand',
  pondicherry: 'Puducherry', 'a&n islands': 'Andaman and Nicobar Islands', 'mp': 'Madhya Pradesh', 'up': 'Uttar Pradesh', 'hp': 'Himachal Pradesh',
};

export function addressText(address: unknown): string {
  if (typeof address === 'string') return address.trim();
  if (address && typeof address === 'object') {
    const a = address as Record<string, unknown>;
    for (const k of ['full', 'address', 'line1']) if (typeof a[k] === 'string' && (a[k] as string).trim()) return (a[k] as string).trim();
    return Object.values(a).filter((v) => typeof v === 'string').join(', ').trim();
  }
  return '';
}

export function extractPin(text: string): string | null {
  return text.match(/(?<!\d)([1-9]\d{5})(?!\d)/)?.[1] ?? null;
}

/** Best-effort state + city from free text, used only when the PIN lookup is unavailable. */
export function guessStateCity(text: string): { state?: string; city?: string } {
  const lower = ` ${text.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ')} `;
  let best: { name: string; at: number; len: number } | null = null;
  const candidates: [string, string][] = [...INDIAN_STATES.map((s) => [s.toLowerCase(), s] as [string, string]), ...Object.entries(STATE_ALIASES)];
  for (const [needle, canonical] of candidates) {
    const at = lower.lastIndexOf(` ${needle} `);
    if (at >= 0 && (!best || needle.length > best.len)) best = { name: canonical, at, len: needle.length };
  }
  if (!best) return {};
  const before = lower.slice(0, best.at).trim().split(' ').filter((w) => w && !/^\d+$/.test(w));
  const city = before.length ? before[before.length - 1] : undefined;
  return { state: best.name, city: city ? city.charAt(0).toUpperCase() + city.slice(1) : undefined };
}

export function indianMobile(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function splitName(name?: string | null): { first: string; last: string } {
  const parts = String(name || 'Customer').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || 'Customer', last: parts.slice(1).join(' ') };
}

/** City/district and state for a PIN from India Post's public API. Returns null on any failure. */
export async function lookupPin(pin: string): Promise<{ city: string; state: string } | null> {
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const office = data?.[0]?.PostOffice?.[0];
    if (data?.[0]?.Status !== 'Success' || !office?.District || !office?.State) return null;
    return { city: String(office.District), state: String(office.State) };
  } catch {
    return null;
  }
}

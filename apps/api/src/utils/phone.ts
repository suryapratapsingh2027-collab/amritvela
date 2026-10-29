/**
 * Canonical phone format used everywhere: digits only, India country code, e.g. 919876543210.
 * WhatsApp sends numbers in this form, so website/donation/order forms must produce the same
 * value or the same person becomes two different customers.
 */
export function normalizePhone(input: unknown): string | null {
  const digits = String(input ?? '').replace(/\D/g, '');
  let ten: string | null = null;
  if (digits.length === 10) ten = digits;
  else if (digits.length === 11 && digits.startsWith('0')) ten = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith('091')) ten = digits.slice(3);
  if (!ten || !/^[6-9]\d{9}$/.test(ten)) return null; // Indian mobiles start with 6-9
  return `91${ten}`;
}

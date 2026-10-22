import { db } from '../db';
import { createDonationPaymentLink } from '../integrations/razorpay';
import { sendWhatsAppText } from '../integrations/whatsapp';

export async function createAndSendDonationLink(input: { phone: string; name?: string | null; email?: string | null; amount: number }) {
  const amount = Math.round(Number(input.amount));
  if (!input.phone || !Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) {
    throw new Error('Valid phone and donation amount (₹1–₹1,00,00,000) are required.');
  }
  const user = await db.user.upsert({
    where: { phone: input.phone },
    update: { ...(input.name ? { name: input.name } : {}), ...(input.email ? { email: input.email } : {}) },
    create: { phone: input.phone, name: input.name || undefined, email: input.email || undefined },
  });
  const reference = `DON-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const donation = await db.donation.create({ data: { reference, userId: user.id, amount } });
  try {
    const link: any = await createDonationPaymentLink({ amount, reference, donationId: donation.id, name: user.name, email: user.email, phone: user.phone });
    // Keep the existing schema compatible: this field stores the provider checkout identifier
    // (Payment Link ID for this flow; Order ID for the existing website checkout).
    await db.donation.update({ where: { id: donation.id }, data: { razorpayOrderId: String(link.id) } });
    const url = String(link.short_url || '');
    if (!url) throw new Error('Razorpay did not return a Payment Link URL.');
    const message = `Namaste${user.name ? ` ${user.name}` : ''}! Amrit Vela Trust ko ₹${amount} donation karne ke liye is secure Razorpay link par payment karein:
${url}

Reference: ${reference}
Payment confirm hone ke baad aapki PDF receipt isi WhatsApp par bhej di jayegi.`;
    await sendWhatsAppText(user.phone, message);
    return { donationId: donation.id, reference, amount, paymentLinkId: link.id, paymentUrl: url, message };
  } catch (error) {
    // Preserve a pending record for audit, but never tell the donor a link was sent.
    throw error;
  }
}

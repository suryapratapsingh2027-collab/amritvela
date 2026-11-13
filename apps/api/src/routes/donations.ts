import { Router } from 'express';
import { db } from '../db';
import { createPayment, verifyCheckoutSignature } from '../integrations/razorpay';
import { createAndSendDonationLink } from '../services/donation-payment-link';
import { auth } from '../middleware/auth';
import { env } from '../config';
import { normalizePhone } from '../utils/phone';
import { isAcceptingDonations } from '../services/campaigns';
import { buildDonationReceipt } from '../services/receipt-doc';
import { deliverDonationReceipt, markDonationPaid } from '../services/payments';
import { paymentAccount, accountForDonation } from '../services/trust-accounts';


const r = Router();

// Trusts a donor can give to (website donate page): online ones accept a payment, QR-only ones show their QR / UPI id.
r.get('/trusts', async (_req, res) => {
  const rows = await db.trust.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  res.json(rows.map((t) => ({
    slug: t.slug, name: t.name, online: paymentAccount(t as any).link, qrImageUrl: t.offerQr || t.accountMode === 'QR_ONLY' ? t.qrImageUrl : null,
    upiId: t.offerQr || t.accountMode === 'QR_ONLY' ? t.upiId : null, presets: Array.isArray(t.presets) ? t.presets : [], contactPhone: t.contactPhone,
  })));
});

// Creates a Razorpay Payment Link and sends it to the donor's WhatsApp.
r.post('/whatsapp-link', async (req, res) => {
  try {
    const { phone, name, email, amount } = req.body || {};
    const normalized = normalizePhone(phone);
    if (!normalized) return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
    const trust = req.body?.trustSlug ? await db.trust.findFirst({ where: { slug: String(req.body.trustSlug), active: true } }) : null;
    if (req.body?.trustSlug && !trust) return res.status(400).json({ error: 'This trust is not accepting donations right now.' });
    const result = await createAndSendDonationLink({ phone: normalized, name, email, amount: Number(amount), trustId: trust?.id ?? null });
    return res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    console.error('[DONATION PAYMENT LINK ERROR]', error?.message || error);
    return res.status(400).json({ error: error?.message || 'Could not create donation payment link' });
  }
});

r.post('/', async (req, res) => {
  try {
    const { name, email, amount } = req.body || {};
    const phone = normalizePhone(req.body?.phone);
    const value = Number(amount);
    if (!phone) return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
    if (!Number.isSafeInteger(value) || value <= 0 || value > 10000000) {
      return res.status(400).json({ error: 'phone and a whole-number donation amount between ₹1 and ₹1,00,00,000 are required' });
    }
    const user = await db.user.upsert({ where: { phone }, update: { name, email }, create: { phone, name, email } });
    const reference = `DON-${Date.now()}-${Math.floor(Math.random() * 90000 + 10000)}`;
    let campaignId: string | null = null;
    if (req.body?.campaignSlug) {
      const campaign = await db.campaign.findUnique({ where: { slug: String(req.body.campaignSlug) } });
      if (!campaign || !isAcceptingDonations(campaign)) return res.status(400).json({ error: 'This campaign is not accepting donations right now.' });
      campaignId = campaign.id;
    }
    // Optional: a specific trust (its own Razorpay account), or the trust linked to the campaign.
    let trust: any = null;
    const trustSlug = req.body?.trustSlug ? String(req.body.trustSlug) : null;
    if (trustSlug) {
      trust = await db.trust.findFirst({ where: { slug: trustSlug, active: true } });
      if (!trust) return res.status(400).json({ error: 'This trust is not accepting donations right now.' });
    } else if (campaignId) {
      const linked = await db.campaign.findUnique({ where: { id: campaignId }, select: { trustId: true } });
      if (linked?.trustId) trust = await db.trust.findFirst({ where: { id: linked.trustId, active: true } });
    }
    const pay = paymentAccount(trust);
    if (!pay.link) return res.status(400).json({ error: `${trust?.name || 'This trust'} accepts donations by QR / UPI only. Please use the QR code shown for it, or donate on WhatsApp.` });
    const donation = await db.donation.create({ data: { reference, userId: user.id, amount: Math.round(value), campaignId, trustId: trust?.id ?? null } });
    const payment = await createPayment(Math.round(value), reference, pay.account);
    await db.donation.update({ where: { id: donation.id }, data: { razorpayOrderId: String((payment as any).id) } });
    res.status(201).json({ donationId: donation.id, reference, payment, keyId: pay.account?.keyId ?? process.env.RAZORPAY_KEY_ID ?? null });
  } catch (e: any) { res.status(500).json({ error: e.message || 'Donation failed' }); }
});

r.post('/:id/verify', async (req, res) => {
  try {
    const { razorpayPaymentId, razorpaySignature } = req.body || {};
    const donation = await db.donation.findUnique({ where: { id: String(req.params.id) } });
    if (!donation) return res.status(404).json({ error: 'Donation not found' });
    if (!donation.razorpayOrderId || !verifyCheckoutSignature(String(donation.razorpayOrderId), String(razorpayPaymentId), String(razorpaySignature), await accountForDonation(donation))) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
    await markDonationPaid(donation.id, String(razorpayPaymentId));
    await deliverDonationReceipt(donation.id); // exactly once, even if the webhook also fires
    res.json(await db.donation.findUnique({ where: { id: donation.id }, include: { user: true } }));
  } catch (e: any) { res.status(500).json({ error: e.message || 'Verification failed' }); }
});

r.post('/:id/mock-pay', async (req, res) => {
  if (!env.MOCK_PROVIDERS) return res.status(404).json({ error: 'Not found' });
  const donation = await db.donation.findUnique({ where: { id: String(req.params.id) } });
  if (!donation) return res.status(404).json({ error: 'Donation not found' });
  await markDonationPaid(donation.id, `mock_pay_${Date.now()}`);
  await deliverDonationReceipt(donation.id);
  res.json({ donation: await db.donation.findUnique({ where: { id: donation.id }, include: { user: true } }), message: 'Donation marked paid in mock mode.' });
});

r.get('/:id/receipt', async (req, res) => {
  const d = await db.donation.findUnique({ where: { id: String(req.params.id) }, select: { id: true, paymentStatus: true } });
  if (!d) return res.status(404).json({ error: 'Donation not found' });
  if (d.paymentStatus !== 'PAID') return res.status(409).json({ error: 'Receipt is available only after the payment is verified.' });
  const { pdf, fileName } = await buildDonationReceipt(d.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.send(pdf);
});

r.get('/', auth, async (_, res) => res.json(await db.donation.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' } })));
export default r;

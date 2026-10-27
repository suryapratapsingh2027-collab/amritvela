import { Router } from 'express';
import { db } from '../db';
import { createPayment, verifyCheckoutSignature } from '../integrations/razorpay';
import { createAndSendDonationLink } from '../services/donation-payment-link';
import { auth } from '../middleware/auth';
import { env } from '../config';
import { makeReceipt } from '../services/receipt';
import { deliverDonationReceipt, markDonationPaid } from '../services/payments';


const r = Router();

// Creates a Razorpay Payment Link and sends it to the donor's WhatsApp.
r.post('/whatsapp-link', async (req, res) => {
  try {
    const { phone, name, email, amount } = req.body || {};
    const result = await createAndSendDonationLink({ phone: String(phone || '').trim(), name, email, amount: Number(amount) });
    return res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    console.error('[DONATION PAYMENT LINK ERROR]', error?.message || error);
    return res.status(400).json({ error: error?.message || 'Could not create donation payment link' });
  }
});

r.post('/', async (req, res) => {
  try {
    const { phone, name, email, amount } = req.body || {};
    const value = Number(amount);
    if (!phone || !Number.isSafeInteger(value) || value <= 0 || value > 10000000) {
      return res.status(400).json({ error: 'phone and a whole-number donation amount between ₹1 and ₹1,00,00,000 are required' });
    }
    const user = await db.user.upsert({ where: { phone }, update: { name, email }, create: { phone, name, email } });
    const reference = `DON-${Date.now()}-${Math.floor(Math.random() * 90000 + 10000)}`;
    const donation = await db.donation.create({ data: { reference, userId: user.id, amount: Math.round(value) } });
    const payment = await createPayment(Math.round(value), reference);
    await db.donation.update({ where: { id: donation.id }, data: { razorpayOrderId: String((payment as any).id) } });
    res.status(201).json({ donationId: donation.id, reference, payment, keyId: process.env.RAZORPAY_KEY_ID || null });
  } catch (e: any) { res.status(500).json({ error: e.message || 'Donation failed' }); }
});

r.post('/:id/verify', async (req, res) => {
  try {
    const { razorpayPaymentId, razorpaySignature } = req.body || {};
    const donation = await db.donation.findUnique({ where: { id: String(req.params.id) } });
    if (!donation) return res.status(404).json({ error: 'Donation not found' });
    if (!donation.razorpayOrderId || !verifyCheckoutSignature(String(donation.razorpayOrderId), String(razorpayPaymentId), String(razorpaySignature))) {
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
  const d = await db.donation.findUnique({ where: { id: String(req.params.id) }, include: { user: true } });
  if (!d) return res.status(404).json({ error: 'Donation not found' });
  if (d.paymentStatus !== 'PAID') return res.status(400).json({ error: 'Receipt is available after payment' });
  const pdf = await makeReceipt({ reference: d.reference, name: d.user.name, amount: d.amount, status: d.paymentStatus, paymentId: d.razorpayPaymentId, paidAt: d.paidAt, phone: d.user.phone });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${d.reference}.pdf"`);
  res.send(pdf);
});

r.get('/', auth, async (_, res) => res.json(await db.donation.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' } })));
export default r;

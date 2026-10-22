import { Router } from 'express';
import { auth } from '../middleware/auth';
import { db } from '../db';
import { shipOrder } from '../services/fulfillment';
import { sendWhatsAppText } from '../integrations/whatsapp';

const r = Router(); r.use(auth);

// Gallery and event-poster management (admin-only; this router is protected by auth).
r.get('/gallery', async (_, res) => res.json(await db.galleryImage.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] })));
r.post('/gallery', async (req, res) => res.status(201).json(await db.galleryImage.create({ data: { title: req.body.title || 'Sangat Gallery', imageUrl: req.body.imageUrl, altText: req.body.altText || null, sortOrder: Number(req.body.sortOrder || 0), active: req.body.active ?? true } })));
r.patch('/gallery/:id', async (req, res) => res.json(await db.galleryImage.update({ where: { id: req.params.id }, data: { title: req.body.title, imageUrl: req.body.imageUrl, altText: req.body.altText, sortOrder: req.body.sortOrder, active: req.body.active } })));
r.delete('/gallery/:id', async (req, res) => { await db.galleryImage.delete({ where: { id: req.params.id } }); res.status(204).end(); });
r.get('/posters', async (_, res) => res.json(await db.eventPoster.findMany({ orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }] })));
r.post('/posters', async (req, res) => { if (req.body.featured) await db.eventPoster.updateMany({ data: { featured: false } }); res.status(201).json(await db.eventPoster.create({ data: { title: req.body.title, description: req.body.description || null, imageUrl: req.body.imageUrl, eventDate: req.body.eventDate || null, venue: req.body.venue || null, active: req.body.active ?? true, featured: req.body.featured ?? false } })); });
r.patch('/posters/:id', async (req, res) => { if (req.body.featured) await db.eventPoster.updateMany({ where: { id: { not: req.params.id } }, data: { featured: false } }); res.json(await db.eventPoster.update({ where: { id: req.params.id }, data: { title: req.body.title, description: req.body.description, imageUrl: req.body.imageUrl, eventDate: req.body.eventDate, venue: req.body.venue, active: req.body.active, featured: req.body.featured } })); });
r.delete('/posters/:id', async (req, res) => { await db.eventPoster.delete({ where: { id: req.params.id } }); res.status(204).end(); });
r.post('/media/upload', async (req, res) => {
  try {
    const { dataUrl, fileName } = req.body as { dataUrl?: string; fileName?: string };
    if (!dataUrl || !/^data:image\/(png|jpe?g|webp);base64,/i.test(dataUrl)) return res.status(400).json({ error: 'Please select a PNG, JPG or WebP image.' });
    if (dataUrl.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Image is too large. Please use an image under 7 MB.' });
    const cloud = process.env.CLOUDINARY_CLOUD_NAME; const preset = process.env.CLOUDINARY_UPLOAD_PRESET;
    if (!cloud || !preset) return res.status(503).json({ error: 'Image uploads need CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in API environment variables.' });
    const form = new URLSearchParams({ file: dataUrl, upload_preset: preset, folder: 'amrit-vela-trust' });
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const result: any = await response.json(); if (!response.ok || !result.secure_url) return res.status(502).json({ error: result.error?.message || 'Image upload failed.' });
    res.json({ imageUrl: result.secure_url, fileName: fileName || result.public_id });
  } catch (e: any) { res.status(500).json({ error: e.message || 'Image upload failed.' }); }
});

r.get('/stats', async (_, res) => { const [orders, donations, customers, conversations, pending] = await Promise.all([db.order.count(), db.donation.count(), db.user.count(), db.conversation.count(), db.order.count({ where: { paymentStatus: 'PENDING' } })]); const revenue = await db.order.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { total: true } }); const donationTotal = await db.donation.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { amount: true } }); res.json({ orders, donations, customers, conversations, pendingPayments: pending, revenue: revenue._sum.total || 0, donationTotal: donationTotal._sum.amount || 0 }); });
r.get('/products', async (_, res) => res.json(await db.product.findMany({ orderBy: { createdAt: 'desc' } })));
r.post('/products', async (req, res) => res.status(201).json(await db.product.create({ data: req.body })));
r.patch('/products/:id', async (req, res) => res.json(await db.product.update({ where: { id: req.params.id }, data: req.body })));
r.delete('/products/:id', async (req, res) => { await db.product.update({ where: { id: req.params.id }, data: { active: false } }); res.status(204).end(); });
r.get('/orders', async (_, res) => res.json(await db.order.findMany({ include: { user: true, items: { include: { product: true } } }, orderBy: { createdAt: 'desc' } })));
r.post('/orders/:id/ship', async (req, res) => { try { res.json(await shipOrder(req.params.id)); } catch (e: any) { res.status(400).json({ error: e.message }); } });
r.get('/donations', async (_, res) => res.json(await db.donation.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' } })));
r.get('/customers', async (_, res) => res.json(await db.user.findMany({ include: { _count: { select: { orders: true, donations: true, conversations: true } } }, orderBy: { createdAt: 'desc' } })));
r.get('/conversations', async (_, res) => res.json(await db.conversation.findMany({ include: { user: true, messages: { orderBy: { createdAt: 'desc' }, take: 20 }, supportTickets: { where: { status: 'OPEN' } } }, orderBy: { lastMessageAt: 'desc' } })));
r.patch('/conversations/:id', async (req, res) => res.json(await db.conversation.update({ where: { id: req.params.id }, data: { mode: req.body.mode } })));
r.get('/knowledge', async (_, res) => res.json(await db.knowledgeDocument.findMany({ orderBy: { updatedAt: 'desc' } })));
r.post('/knowledge', async (req, res) => res.status(201).json(await db.knowledgeDocument.create({ data: { title: req.body.title, content: req.body.content, active: req.body.active ?? true } })));
r.patch('/knowledge/:id', async (req, res) => res.json(await db.knowledgeDocument.update({ where: { id: req.params.id }, data: req.body })));
r.get('/tickets', async (_, res) => res.json(await db.supportTicket.findMany({ include: { conversation: { include: { user: true } } }, orderBy: { createdAt: 'desc' } })));
r.patch('/tickets/:id', async (req, res) => res.json(await db.supportTicket.update({ where: { id: req.params.id }, data: { status: req.body.status } })));
export default r;

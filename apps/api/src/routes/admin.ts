import { Router } from 'express';
import { auth } from '../middleware/auth';
import { db } from '../db';
import { shipOrder } from '../services/fulfillment';
import { sendWhatsAppText, whatsappErrorInfo, whatsappLive } from '../integrations/whatsapp';
import { z } from 'zod';
import { SOCIAL_FIELDS, getSocialLinks, saveSocialLinks, validateSocialUrl, type SocialField } from '../services/settings';

const r = Router(); r.use(auth);

// Gallery and event-poster management (admin-only; this router is protected by auth).
r.get('/gallery', async (_, res) => res.json(await db.galleryImage.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] })));
r.post('/gallery', async (req, res) => { if (!/^https:\/\//i.test(String(req.body?.imageUrl || ''))) return res.status(400).json({ error: 'Upload an image first.' }); res.status(201).json(await db.galleryImage.create({ data: { title: req.body.title || 'Sangat Gallery', imageUrl: req.body.imageUrl, altText: req.body.altText || null, sortOrder: Number(req.body.sortOrder || 0), active: req.body.active ?? true } })); });
r.patch('/gallery/:id', async (req, res) => res.json(await db.galleryImage.update({ where: { id: req.params.id }, data: { title: req.body.title, imageUrl: req.body.imageUrl, altText: req.body.altText, sortOrder: req.body.sortOrder, active: req.body.active } })));
r.delete('/gallery/:id', async (req, res) => { await db.galleryImage.delete({ where: { id: req.params.id } }); res.status(204).end(); });
r.get('/posters', async (_, res) => res.json(await db.eventPoster.findMany({ orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }] })));
r.post('/posters', async (req, res) => { if (!String(req.body?.title || '').trim() || !/^https:\/\//i.test(String(req.body?.imageUrl || ''))) return res.status(400).json({ error: 'A poster title and image are required.' }); if (req.body.featured) await db.eventPoster.updateMany({ data: { featured: false } }); res.status(201).json(await db.eventPoster.create({ data: { title: req.body.title, description: req.body.description || null, imageUrl: req.body.imageUrl, eventDate: req.body.eventDate || null, venue: req.body.venue || null, active: req.body.active ?? true, featured: req.body.featured ?? false } })); });
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
/* ------------------------------------------------------------------ products (validated: never store raw req.body) */

const slugify = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
async function uniqueSlug(name: string) {
  const base = slugify(name).slice(0, 60);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.product.findUnique({ where: { slug: candidate } }))) return candidate;
  }
  return `${base}-${Date.now()}`;
}

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const productInput = z.object({
  name: z.string().trim().min(2, 'The product name must be at least 2 characters.').max(80, 'Keep the name within 80 characters.'),
  description: z.string().trim().max(1000, 'Keep the description within 1000 characters.').optional(),
  price: z.coerce.number().int('Enter the price in whole rupees (no paise).').min(1, 'The price must be at least ₹1.').max(10_000_000, 'The price is too high.'),
  stock: z.coerce.number().int('Enter the stock as a whole number.').min(0, 'Stock cannot be negative.').max(1_000_000, 'The stock quantity is too high.'),
  category: z.preprocess(emptyToNull, z.string().trim().max(40, 'Keep the category within 40 characters.').nullable().optional()),
  imageUrl: z.preprocess(emptyToNull, z.string().trim().max(2000).refine((v) => /^https:\/\//i.test(v), 'The image link must start with https://').nullable().optional()),
  active: z.boolean().optional(),
});
// Works with zod v3 and v4: type errors (missing / not a number) are mapped by field instead of constructor options.
const FIELD_TYPE_MESSAGE: Record<string, string> = {
  name: 'Enter the product name.', price: 'Enter the price as a number.', stock: 'Enter the stock as a number.',
  title: 'Enter a title.', content: 'Enter the content.', text: 'Enter a message.', mode: 'mode must be AI or HUMAN',
};
const zerr = (e: z.ZodError) => {
  const issue = e.issues[0];
  if (!issue) return 'Invalid input';
  // Non-integers are reported as invalid_type (expected int/integer) by both zod 3 and 4: keep their own message.
  if (issue.code === 'invalid_type' && !/^int/.test(String((issue as any).expected))) return FIELD_TYPE_MESSAGE[String(issue.path[0] ?? '')] || 'Some fields are missing or invalid. Please check and try again.';
  return issue.message;
};

async function nameTaken(name: string, exceptId?: string) {
  const clash = await db.product.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, active: true, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  return Boolean(clash);
}

r.get('/products', async (_, res) => res.json(await db.product.findMany({ orderBy: { createdAt: 'desc' } })));

r.post('/products', async (req, res) => {
  const parsed = productInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  const d = parsed.data;
  // The WhatsApp bot finds products by name, so two live products with one name would be ambiguous.
  if (d.active !== false && (await nameTaken(d.name))) return res.status(409).json({ error: 'A product with this name already exists. Please use a different name.' });
  const created = await db.product.create({ data: {
    name: d.name, slug: await uniqueSlug(d.name), description: d.description ?? '', price: d.price, stock: d.stock,
    category: d.category ?? null, imageUrl: d.imageUrl ?? null, active: d.active ?? true,
  } });
  res.status(201).json(created);
});

r.patch('/products/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await db.product.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const parsed = productInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  const d = parsed.data;
  const nextActive = d.active ?? existing.active;
  if (nextActive && d.name && (await nameTaken(d.name, id))) return res.status(409).json({ error: 'A product with this name already exists. Please use a different name.' });
  if (nextActive && !existing.active && !d.name && (await nameTaken(existing.name, id))) return res.status(409).json({ error: 'Another active product already uses this name.' });
  const updated = await db.product.update({ where: { id }, data: {
    ...(d.name !== undefined ? { name: d.name } : {}), ...(d.description !== undefined ? { description: d.description } : {}),
    ...(d.price !== undefined ? { price: d.price } : {}), ...(d.stock !== undefined ? { stock: d.stock } : {}),
    ...(d.category !== undefined ? { category: d.category } : {}), ...(d.imageUrl !== undefined ? { imageUrl: d.imageUrl } : {}),
    ...(d.active !== undefined ? { active: d.active } : {}),
  } });
  res.json(updated);
});

// Soft delete: products that appear on past orders can never be hard-deleted.
r.delete('/products/:id', async (req, res) => {
  const found = await db.product.findUnique({ where: { id: String(req.params.id) } });
  if (!found) return res.status(404).json({ error: 'Product not found' });
  await db.product.update({ where: { id: found.id }, data: { active: false } });
  res.status(204).end();
});
r.get('/orders', async (_, res) => res.json(await db.order.findMany({ include: { user: true, items: { include: { product: true } } }, orderBy: { createdAt: 'desc' } })));
r.post('/orders/:id/ship', async (req, res) => { try { res.json(await shipOrder(req.params.id)); } catch (e: any) { res.status(400).json({ error: e.message }); } });
r.get('/donations', async (_, res) => res.json(await db.donation.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' } })));
r.get('/customers', async (_, res) => res.json(await db.user.findMany({ include: { _count: { select: { orders: true, donations: true, conversations: true } } }, orderBy: { createdAt: 'desc' } })));
/* ------------------------------------------------------------------ support inbox */

r.get('/conversations', async (_, res) => {
  const rows = await db.conversation.findMany({
    include: { user: { select: { id: true, name: true, phone: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 }, supportTickets: { where: { status: 'OPEN' }, select: { id: true } } },
    orderBy: { lastMessageAt: 'desc' }, take: 150,
  });
  res.json(rows.map((c) => {
    const last = c.messages[0];
    return {
      id: c.id, mode: c.mode, channel: c.channel, lastMessageAt: c.lastMessageAt, user: c.user,
      lastMessage: last ? { text: last.text, direction: last.direction, createdAt: last.createdAt } : null,
      openTickets: c.supportTickets.length,
      // A customer wrote last and a human owns the chat: this needs a reply.
      awaitingReply: c.mode === 'HUMAN' && last?.direction === 'IN',
    };
  }));
});

r.get('/conversations/:id/messages', async (req, res) => {
  const c = await db.conversation.findUnique({ where: { id: String(req.params.id) }, include: { user: { select: { id: true, name: true, phone: true } } } });
  if (!c) return res.status(404).json({ error: 'Conversation not found' });
  const take = Math.min(300, Math.max(1, Number(req.query.take) || 150));
  const messages = (await db.message.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: 'desc' }, take })).reverse();
  res.json({ id: c.id, mode: c.mode, channel: c.channel, user: c.user, messages });
});

r.patch('/conversations/:id', async (req, res) => {
  const parsed = z.object({ mode: z.enum(['AI', 'HUMAN']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'mode must be AI or HUMAN' });
  const id = String(req.params.id);
  if (!(await db.conversation.findUnique({ where: { id } }))) return res.status(404).json({ error: 'Conversation not found' });
  const updated = await db.conversation.update({ where: { id }, data: { mode: parsed.data.mode } });
  if (parsed.data.mode === 'AI') await db.supportTicket.updateMany({ where: { conversationId: id, status: 'OPEN' }, data: { status: 'CLOSED' } });
  res.json(updated);
});

r.post('/conversations/:id/reply', async (req, res) => {
  const parsed = z.object({ text: z.string().trim().min(1, 'The message is empty.').max(1500, 'Keep the message within 1500 characters.') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  const c = await db.conversation.findUnique({ where: { id: String(req.params.id) }, include: { user: true } });
  if (!c) return res.status(404).json({ error: 'Conversation not found' });
  const admin = (req as any).admin;

  if (c.channel === 'WHATSAPP') {
    if (!whatsappLive()) return res.status(503).json({ error: 'WhatsApp is not configured (MOCK mode, or the access token / phone number ID is missing), so the message cannot be sent.' });
    try {
      await sendWhatsAppText(c.user.phone, parsed.data.text);
    } catch (e: any) {
      const info = whatsappErrorInfo(e);
      console.error('[ADMIN REPLY] WhatsApp send failed:', info);
      if (info.windowClosed) return res.status(409).json({ error: 'This customer has not messaged in the last 24 hours, so WhatsApp does not allow a free-form reply. Wait for the next message from the customer, or send an approved template.' });
      return res.status(502).json({ error: `WhatsApp ne message reject kiya: ${info.message}` });
    }
  }
  const message = await db.message.create({ data: { conversationId: c.id, direction: 'OUT', text: parsed.data.text, metadata: { by: 'admin', adminEmail: admin.email, channel: c.channel } } });
  // Replying as a human means a human owns the chat now, so the bot must not talk over them.
  await db.conversation.update({ where: { id: c.id }, data: { mode: 'HUMAN', lastMessageAt: new Date() } });
  res.status(201).json({ ok: true, message, delivered: c.channel === 'WEB' ? 'website' : 'whatsapp' });
});
r.get('/knowledge', async (_, res) => res.json(await db.knowledgeDocument.findMany({ orderBy: { updatedAt: 'desc' } })));
// A hand-edited document loses its KB_VERSION marker, which tells bootstrap never to overwrite it again.
const stripMarker = (t: string) => t.replace(/^KB_VERSION:\d+\s*\n?/m, '').trim();
const knowledgeInput = z.object({ title: z.string().trim().min(2, 'Enter a title.').max(120), content: z.string().trim().min(5, 'Enter the content.').max(60000, 'The content is too long.'), active: z.boolean().optional() });

r.post('/knowledge', async (req, res) => {
  const parsed = knowledgeInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  res.status(201).json(await db.knowledgeDocument.create({ data: { title: parsed.data.title, content: stripMarker(parsed.data.content), active: parsed.data.active ?? true } }));
});
r.patch('/knowledge/:id', async (req, res) => {
  const parsed = knowledgeInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  const id = String(req.params.id);
  if (!(await db.knowledgeDocument.findUnique({ where: { id } }))) return res.status(404).json({ error: 'Document not found' });
  const d = parsed.data;
  res.json(await db.knowledgeDocument.update({ where: { id }, data: { ...(d.title !== undefined ? { title: d.title } : {}), ...(d.content !== undefined ? { content: stripMarker(d.content) } : {}), ...(d.active !== undefined ? { active: d.active } : {}) } }));
});
r.get('/tickets', async (_, res) => res.json(await db.supportTicket.findMany({ include: { conversation: { include: { user: true } } }, orderBy: { createdAt: 'desc' } })));
r.patch('/tickets/:id', async (req, res) => res.json(await db.supportTicket.update({ where: { id: req.params.id }, data: { status: req.body.status } })));
/* ------------------------------------------------------------------ social links (shown in the WhatsApp "Follow us" menu) */

r.get('/settings/social', async (_req, res) => res.json(await getSocialLinks()));

r.put('/settings/social', async (req, res) => {
  const input: Partial<Record<SocialField, string>> = {};
  for (const f of SOCIAL_FIELDS) {
    const raw = req.body?.[f];
    if (raw === undefined) continue;
    const v = String(raw ?? '').trim();
    if (v) { const problem = validateSocialUrl(f, v); if (problem) return res.status(400).json({ error: problem }); }
    input[f] = v;
  }
  await saveSocialLinks(input);
  res.json(await getSocialLinks());
});

/* ------------------------------------------------------------------ PDF documents (offered to customers in the WhatsApp "Downloads" list) */

const MAX_PDF_BYTES = 8 * 1024 * 1024;
const docSelect = { id: true, title: true, description: true, fileName: true, mimeType: true, size: true, active: true, sortOrder: true, downloads: true, createdAt: true, updatedAt: true } as const;

r.get('/documents', async (_req, res) => res.json(await db.document.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], select: docSelect })));

r.post('/documents', async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(2, 'Enter a title (at least 2 characters).').max(24, 'Keep the title within 24 characters so it fits in the WhatsApp list.'),
    description: z.preprocess(emptyToNull, z.string().trim().max(72, 'Keep the description within 72 characters.').nullable().optional()),
    fileName: z.string().trim().max(200).optional(),
    dataUrl: z.string().min(20, 'Choose a PDF file.'),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  const match = parsed.data.dataUrl.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ error: 'Only PDF files are allowed.' });
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length > MAX_PDF_BYTES) return res.status(413).json({ error: 'The PDF is too large. Maximum size is 8 MB.' });
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ error: 'This file is not a valid PDF.' });
  const fileName = (parsed.data.fileName || `${parsed.data.title}.pdf`).replace(/\.pdf$/i, '') + '.pdf';
  const count = await db.document.count();
  const created = await db.document.create({
    data: { title: parsed.data.title, description: parsed.data.description ?? null, fileName, size: bytes.length, data: bytes, sortOrder: count },
    select: docSelect,
  });
  res.status(201).json(created);
});

r.patch('/documents/:id', async (req, res) => {
  const parsed = z.object({
    title: z.string().trim().min(2, 'Enter a title (at least 2 characters).').max(24, 'Keep the title within 24 characters so it fits in the WhatsApp list.'),
    description: z.preprocess(emptyToNull, z.string().trim().max(72, 'Keep the description within 72 characters.').nullable().optional()),
    active: z.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(10000),
  }).partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  const id = String(req.params.id);
  if (!(await db.document.findUnique({ where: { id }, select: { id: true } }))) return res.status(404).json({ error: 'Document not found' });
  const d = parsed.data;
  res.json(await db.document.update({ where: { id }, select: docSelect, data: {
    ...(d.title !== undefined ? { title: d.title } : {}), ...(d.description !== undefined ? { description: d.description } : {}),
    ...(d.active !== undefined ? { active: d.active } : {}), ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
  } }));
});

r.delete('/documents/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!(await db.document.findUnique({ where: { id }, select: { id: true } }))) return res.status(404).json({ error: 'Document not found' });
  await db.document.delete({ where: { id } });
  res.status(204).end();
});

/* ------------------------------------------------------------------ additional trusts (e.g. Nanak Roti Trust) */

const optionalText = (max: number, msg: string) => z.preprocess(emptyToNull, z.string().trim().max(max, msg).nullable().optional());
const trustInput = z.object({
  name: z.string().trim().min(2, 'Enter the trust name.').max(24, 'Keep the name within 24 characters so it fits in the WhatsApp list.'),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  infoEn: z.string().trim().max(650, 'English information is too long (maximum 650 characters so it fits in one WhatsApp message).'),
  infoHi: optionalText(650, 'Hindi information is too long (maximum 650 characters so it fits in one WhatsApp message).'),
  infoHing: optionalText(650, 'Hinglish information is too long (maximum 650 characters so it fits in one WhatsApp message).'),
  infoPa: optionalText(650, 'Punjabi information is too long (maximum 650 characters so it fits in one WhatsApp message).'),
  qrImageUrl: z.preprocess(emptyToNull, z.string().trim().max(2000).refine((v) => /^https:\/\//i.test(v), 'The QR image link must start with https://').nullable().optional()),
  upiId: z.preprocess(emptyToNull, z.string().trim().max(80).refine((v) => /^[\w.\-]{2,}@[A-Za-z][\w.\-]{1,}$/.test(v), 'Enter a valid UPI ID, for example name@oksbi').nullable().optional()),
  contactPhone: optionalText(30, 'Phone number is too long.'),
  contactEmail: z.preprocess(emptyToNull, z.string().trim().max(120).refine((v) => /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email address.').nullable().optional()),
});

async function uniqueTrustSlug(name: string, exceptId?: string) {
  const base = slugify(name).slice(0, 40) || 'trust';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (candidate === 'amritvela' || candidate === 'amrit-vela-trust') continue; // reserved for the built-in trust
    const clash = await db.trust.findUnique({ where: { slug: candidate } });
    if (!clash || clash.id === exceptId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

r.get('/trusts', async (_req, res) => res.json(await db.trust.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })));

r.post('/trusts', async (req, res) => {
  const parsed = trustInput.partial({ active: true, sortOrder: true, infoEn: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  const d = parsed.data;
  if ((d.active ?? true) && (d.infoEn ?? '').length < 10) return res.status(400).json({ error: 'Write the trust information in English (at least 10 characters) before making it visible, or save it as hidden.' });
  const count = await db.trust.count();
  res.status(201).json(await db.trust.create({ data: {
    slug: await uniqueTrustSlug(d.name), name: d.name, active: d.active ?? true, sortOrder: d.sortOrder ?? count, infoEn: d.infoEn ?? '',
    infoHi: d.infoHi ?? null, infoHing: d.infoHing ?? null, infoPa: d.infoPa ?? null, qrImageUrl: d.qrImageUrl ?? null, upiId: d.upiId ?? null,
    contactPhone: d.contactPhone ?? null, contactEmail: d.contactEmail ?? null,
  } }));
});

r.patch('/trusts/:id', async (req, res) => {
  const id = String(req.params.id);
  const existing = await db.trust.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Trust not found' });
  const parsed = trustInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zerr(parsed.error) });
  const d = parsed.data;
  const nextActive = d.active ?? existing.active;
  const nextInfo = d.infoEn ?? existing.infoEn;
  if (nextActive && nextInfo.length < 10) return res.status(400).json({ error: 'Write the trust information in English (at least 10 characters) before making it visible.' });
  res.json(await db.trust.update({ where: { id }, data: {
    ...(d.name !== undefined ? { name: d.name, slug: await uniqueTrustSlug(d.name, id) } : {}),
    ...(d.active !== undefined ? { active: d.active } : {}), ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
    ...(d.infoEn !== undefined ? { infoEn: d.infoEn } : {}), ...(d.infoHi !== undefined ? { infoHi: d.infoHi } : {}),
    ...(d.infoHing !== undefined ? { infoHing: d.infoHing } : {}), ...(d.infoPa !== undefined ? { infoPa: d.infoPa } : {}),
    ...(d.qrImageUrl !== undefined ? { qrImageUrl: d.qrImageUrl } : {}), ...(d.upiId !== undefined ? { upiId: d.upiId } : {}),
    ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone } : {}), ...(d.contactEmail !== undefined ? { contactEmail: d.contactEmail } : {}),
  } }));
});

r.delete('/trusts/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!(await db.trust.findUnique({ where: { id }, select: { id: true } }))) return res.status(404).json({ error: 'Trust not found' });
  await db.trust.delete({ where: { id } });
  res.status(204).end();
});

export default r;

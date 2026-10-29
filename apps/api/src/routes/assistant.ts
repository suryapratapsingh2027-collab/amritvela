import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { answer, knowledge } from '../services/ai';
import { routeWhatsAppMessage } from '../services/whatsapp-bot';
import { openSupportTicket } from '../services/support';
import { sendWhatsAppText } from '../integrations/whatsapp';
import { auth } from '../middleware/auth';
import { normalizePhone } from '../utils/phone';
import { rateLimit } from '../utils/rate-limit';

const r = Router();

const body = z.object({
  phone: z.string().min(1, 'Mobile number zaroori hai'),
  name: z.string().trim().max(60).optional(),
  message: z.string().trim().min(1, 'Message khali hai').max(1000, 'Message 1000 akshar se chhota rakhein'),
  conversationId: z.string().max(60).optional(),
});

/**
 * Website chat. It uses the SAME deterministic assistant as WhatsApp (donations, orders, receipts, order status)
 * instead of the plain AI, so a visitor can complete a real purchase/donation here without ever being asked for an order id.
 */
r.post('/', rateLimit({ windowMs: 60_000, max: 25, message: 'Bahut zyada messages. Thodi der baad try karein.' }), async (req, res) => {
  try {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.code === 'invalid_type' ? 'Mobile number aur message zaroori hain.' : parsed.error.issues[0]?.message || 'Invalid request' });
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return res.status(400).json({ error: 'Kripya sahi 10-digit mobile number likhein.' });
    const { message, name } = parsed.data;

    let user = await db.user.upsert({ where: { phone }, update: {}, create: { phone, name: name || undefined } });
    if (!user.name && name && name.length >= 2) user = await db.user.update({ where: { id: user.id }, data: { name } });

    let conversation = parsed.data.conversationId
      ? await db.conversation.findFirst({ where: { id: parsed.data.conversationId, userId: user.id, channel: 'WEB' } })
      : null;
    if (!conversation) conversation = await db.conversation.findFirst({ where: { userId: user.id, channel: 'WEB' }, orderBy: { lastMessageAt: 'desc' } });
    if (!conversation) conversation = await db.conversation.create({ data: { userId: user.id, channel: 'WEB' } });

    await db.message.create({ data: { conversationId: conversation.id, direction: 'IN', text: message, metadata: { channel: 'WEB' } } });
    await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

    let mode = conversation.mode === 'CLOSED' ? 'AI' : conversation.mode;
    if (mode === 'HUMAN' && /^\s*(menu|bot|start)\s*$/i.test(message)) mode = 'AI';
    if (mode !== conversation.mode) await db.conversation.update({ where: { id: conversation.id }, data: { mode: mode as any } });

    // A human agent owns this chat; their replies arrive through /poll.
    if (mode === 'HUMAN') return res.json({ conversationId: conversation.id, mode, held: true, text: '', intent: 'HUMAN_HOLD', now: new Date().toISOString() });

    let reply = await routeWhatsAppMessage({ phone, text: message, conversationId: conversation.id, channel: 'web' });
    if (!reply) {
      const out = await answer(message, await knowledge(), phone);
      if (!out.text?.trim()) throw new Error('AI returned an empty response');
      reply = { text: out.text, intent: out.intent };
    }
    if (reply.intent === 'HUMAN') { await openSupportTicket(conversation.id, 'Website visitor requested human support'); mode = 'HUMAN'; }

    await db.message.create({ data: { conversationId: conversation.id, direction: 'OUT', text: reply.text, metadata: { intent: reply.intent, channel: 'WEB', ...(reply.image ? { image: reply.image.url } : {}) } } });
    await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    res.json({ conversationId: conversation.id, mode, text: reply.text, intent: reply.intent, image: reply.image || null, now: new Date().toISOString() });
  } catch (e: any) {
    console.error('[ASSISTANT] failed:', e?.message || e);
    res.status(500).json({ error: 'Assistant abhi available nahi hai. Kripya thodi der baad try karein.' });
  }
});

/** Widget polls this for replies typed by a human agent in the admin console. */
r.get('/poll', rateLimit({ windowMs: 60_000, max: 90 }), async (req, res) => {
  const id = String(req.query.conversationId || '');
  const since = new Date(String(req.query.since || ''));
  if (!id) return res.status(400).json({ error: 'conversationId required' });
  const c = await db.conversation.findFirst({ where: { id, channel: 'WEB' }, select: { id: true, mode: true } });
  if (!c) return res.status(404).json({ error: 'Conversation not found' });
  const messages = await db.message.findMany({
    where: { conversationId: id, direction: 'OUT', metadata: { path: ['by'], equals: 'admin' }, ...(isNaN(since.getTime()) ? {} : { createdAt: { gt: since } }) },
    orderBy: { createdAt: 'asc' }, take: 20, select: { id: true, text: true, createdAt: true },
  });
  res.json({ mode: c.mode, messages, now: new Date().toISOString() });
});

/** Restores the visible chat after a page reload. */
r.get('/history', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const id = String(req.query.conversationId || '');
  const c = id ? await db.conversation.findFirst({ where: { id, channel: 'WEB' }, select: { id: true, mode: true } }) : null;
  if (!c) return res.json({ mode: 'AI', messages: [] });
  const rows = (await db.message.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: 'desc' }, take: 40 })).reverse();
  res.json({
    mode: c.mode,
    now: new Date().toISOString(),
    messages: rows.map((m) => ({ id: m.id, role: m.direction === 'IN' ? 'user' : 'assistant', text: m.text, createdAt: m.createdAt, image: (m.metadata as any)?.image || null, byAdmin: (m.metadata as any)?.by === 'admin' })),
  });
});

r.get('/conversations/:id', auth, async (req, res) => {
  const c = await db.conversation.findUnique({ where: { id: String(req.params.id) }, include: { user: true, messages: { orderBy: { createdAt: 'asc' } } } });
  if (!c) return res.status(404).json({ error: 'Conversation not found' });
  res.json(c);
});

r.post('/whatsapp-preview', auth, async (req, res) => {
  const { phone, message } = req.body || {};
  const to = normalizePhone(phone);
  if (!to || !message) return res.status(400).json({ error: 'valid phone and message are required' });
  const out = await answer(message, await knowledge(), to);
  const delivery = await sendWhatsAppText(to, out.text);
  res.json({ ...out, delivery });
});

export default r;

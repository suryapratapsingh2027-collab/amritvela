import { Router } from 'express';
import { db } from '../db';
import { answer, knowledge } from '../services/ai';
import { sendWhatsAppText } from '../integrations/whatsapp';

const r = Router();

r.post('/', async (req, res) => {
  try {
    const { phone, name, message } = req.body || {};
    if (!phone || !message?.trim()) return res.status(400).json({ error: 'phone and message are required' });
    const user = await db.user.upsert({ where: { phone }, update: name ? { name } : {}, create: { phone, name } });
    let conversation = await db.conversation.findFirst({ where: { userId: user.id }, orderBy: { lastMessageAt: 'desc' } });
    if (!conversation) conversation = await db.conversation.create({ data: { userId: user.id } });
    await db.message.create({ data: { conversationId: conversation.id, direction: 'IN', text: message } });
    const out = await answer(message, await knowledge());
    if (out.intent === 'HUMAN') {
      await db.conversation.update({ where: { id: conversation.id }, data: { mode: 'HUMAN', lastMessageAt: new Date() } });
      const existing = await db.supportTicket.findFirst({ where: { conversationId: conversation.id, status: 'OPEN' } });
      if (!existing) await db.supportTicket.create({ data: { conversationId: conversation.id, subject: 'Customer requested human support' } });
    } else {
      await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
    }
    await db.message.create({ data: { conversationId: conversation.id, direction: 'OUT', text: out.text, metadata: { intent: out.intent } } });
    res.json({ conversationId: conversation.id, ...out });
  } catch (e: any) { res.status(500).json({ error: e.message || 'Assistant failed' }); }
});

r.get('/conversations/:id', async (req, res) => {
  const c = await db.conversation.findUnique({ where: { id: req.params.id }, include: { user: true, messages: { orderBy: { createdAt: 'asc' } } } });
  if (!c) return res.status(404).json({ error: 'Conversation not found' });
  res.json(c);
});

r.post('/whatsapp-preview', async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone and message are required' });
  const out = await answer(message, await knowledge());
  const delivery = await sendWhatsAppText(phone, out.text);
  res.json({ ...out, delivery });
});

export default r;

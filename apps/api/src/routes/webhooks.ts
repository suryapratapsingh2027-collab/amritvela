import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { env } from '../config';
import { verifySignature } from '../integrations/razorpay';
import { interactiveToText, sendWhatsAppImage, sendWhatsAppInteractive, sendWhatsAppText } from '../integrations/whatsapp';
import { normalizeLang, t } from '../i18n';
import { isMenuWord } from '../services/bot-nlp';
import { markOrderPaid } from '../services/fulfillment';
import { answer, knowledge } from '../services/ai';
import { routeWhatsAppMessage, type BotReply } from '../services/whatsapp-bot';
import { openSupportTicket } from '../services/support';
import { deliverDonationReceipt, markDonationPaid, sweepPendingPayments } from '../services/payments';

const r = Router();


/* ================================================================== WHATSAPP */

r.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') {
    console.log('[WHATSAPP] Verification successful');
    return res.status(200).send(challenge);
  }
  console.error('[WHATSAPP] Verification failed');
  return res.sendStatus(403);
});

function verifyMetaSignature(req: Request): boolean {
  if (!env.WHATSAPP_APP_SECRET) return true; // not configured: warned about at boot
  const header = String(req.headers['x-hub-signature-256'] || '');
  const raw = (req as any).rawBody as string | undefined;
  if (!raw || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(raw).digest();
  const received = Buffer.from(header.slice(7), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function userLang(phone: string) {
  try { return normalizeLang((await db.user.findUnique({ where: { phone }, select: { language: true } }))?.language); } catch { return null; }
}

/** Atomically claims a WhatsApp message id. Returns false if another delivery already claimed it. */
async function claimWhatsAppMessage(messageId: string, payload: unknown): Promise<boolean> {
  try {
    await db.webhookEvent.create({ data: { provider: 'whatsapp', eventId: `wa:${messageId}`, payload: payload as Prisma.InputJsonValue, processed: false } });
    return true;
  } catch (e: any) {
    if (e?.code === 'P2002') return false;
    throw e;
  }
}

async function saveOut(conversationId: string, text: string, intent: string, whatsappMessageId: string, extra: Record<string, unknown> = {}) {
  await db.message.create({ data: { conversationId, direction: 'OUT', text, metadata: { intent, whatsappMessageId, ...extra } } });
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
}

async function processIncoming(phone: string, text: string, whatsappMessageId: string, replyId?: string): Promise<void> {
  const user = await db.user.upsert({ where: { phone }, update: {}, create: { phone } });
  let conversation = await db.conversation.findFirst({ where: { userId: user.id, channel: 'WHATSAPP' }, orderBy: { lastMessageAt: 'desc' } });
  if (!conversation) conversation = await db.conversation.create({ data: { userId: user.id } });

  await db.message.create({ data: { conversationId: conversation.id, direction: 'IN', text, metadata: { whatsappMessageId } } });
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

  if (conversation.mode === 'CLOSED') {
    await db.conversation.update({ where: { id: conversation.id }, data: { mode: 'AI' } });
    conversation = { ...conversation, mode: 'AI' };
  }

  // A human agent owns this chat: do not talk over them. The customer can hand the chat back with "menu".
  if (conversation.mode === 'HUMAN') {
    if (isMenuWord(text) || /^\s*bot\s*$/i.test(text) || replyId?.startsWith('menu:') || replyId?.startsWith('lang:')) {
      await db.conversation.update({ where: { id: conversation.id }, data: { mode: 'AI' } });
      conversation = { ...conversation, mode: 'AI' };
    } else {
      const lastOut = await db.message.findFirst({ where: { conversationId: conversation.id, direction: 'OUT' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (!lastOut || Date.now() - lastOut.createdAt.getTime() > 6 * 60 * 60 * 1000) {
        const lang = normalizeLang(user.language);
        const ack = t(lang, 'human_hold', { support: t(lang, 'support') });
        await sendWhatsAppText(phone, ack);
        await saveOut(conversation.id, ack, 'HUMAN_ACK', whatsappMessageId);
      }
      return;
    }
  }

  // 1) Deterministic bot: donations, receipts, product orders, order/payment status.
  let reply: BotReply | null = await routeWhatsAppMessage({ phone, text, conversationId: conversation.id, replyId });

  // 2) Otherwise a grounded AI answer about the Trust (never about money/orders).
  if (!reply) {
    const fresh = await db.user.findUnique({ where: { id: user.id }, select: { language: true } });
    const out = await answer(text, await knowledge(), phone, normalizeLang(fresh?.language));
    if (!out.text?.trim()) throw new Error('AI returned an empty response');
    reply = { text: out.text, intent: out.intent };
  }

  if (reply.intent === 'HUMAN') await openSupportTicket(conversation.id, 'Customer requested human support');

  // Product photo first (best effort: a bad image URL must never block the actual answer).
  if (reply.image) {
    try { await sendWhatsAppImage(phone, reply.image.url, reply.image.caption); }
    catch (e: any) { console.error('[WHATSAPP] Product image failed, continuing with text:', e?.message || e); }
  }
  if (reply.interactive) {
    // Tap-to-choose list/buttons. If Meta rejects it for any reason, the same options are sent as plain numbered text.
    try { await sendWhatsAppInteractive(phone, reply.interactive); }
    catch (e: any) {
      console.error('[WHATSAPP] Interactive message failed, falling back to text:', e?.response?.data ? JSON.stringify(e.response.data) : e?.message || e);
      await sendWhatsAppText(phone, interactiveToText(reply.interactive));
    }
    await saveOut(conversation.id, interactiveToText(reply.interactive), reply.intent, whatsappMessageId, { interactive: true, ...(reply.image ? { image: reply.image.url } : {}) });
  } else {
    await sendWhatsAppText(phone, reply.text);
    await saveOut(conversation.id, reply.text, reply.intent, whatsappMessageId, reply.image ? { image: reply.image.url } : {});
  }

  if (reply.after) {
    try { await reply.after(); } catch (e: any) { console.error('[WHATSAPP] follow-up action failed:', e?.message || e); }
  }
}

r.post('/whatsapp', async (req: Request, res: Response) => {
  if (!verifyMetaSignature(req)) {
    console.error('[WHATSAPP] Invalid X-Hub-Signature-256; request rejected');
    return res.sendStatus(403);
  }

  // Always answer 200 once the payload is accepted: Meta retries non-2xx responses, and a retry of a
  // transactional message must never create a second donation/order.
  try {
    const entries: any[] = Array.isArray(req.body?.entry) ? req.body.entry : [];
    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        const value = change?.value;
        for (const message of value?.messages || []) {
          const phone = String(message?.from || '');
          const id = String(message?.id || '');
          if (!phone) continue;

          // Text, plus the visible title of button / list replies.
          let text = '';
          let replyId: string | undefined;
          if (message.type === 'text') text = String(message.text?.body || '').trim();
          else if (message.type === 'interactive') {
            const reply = message.interactive?.list_reply || message.interactive?.button_reply;
            text = String(reply?.title || '').trim();
            replyId = reply?.id ? String(reply.id) : undefined;
          } else if (message.type === 'button') { text = String(message.button?.text || '').trim(); replyId = message.button?.payload ? String(message.button.payload) : undefined; }

          const dedupeKey = id || crypto.createHash('sha256').update(JSON.stringify(message)).digest('hex');
          if (!(await claimWhatsAppMessage(dedupeKey, { from: phone, type: message.type }))) {
            console.log('[WHATSAPP] Duplicate delivery ignored:', dedupeKey);
            continue;
          }

          try {
            if (!text) {
              if (['image', 'audio', 'video', 'document', 'sticker', 'voice', 'location', 'contacts'].includes(message.type)) {
                await sendWhatsAppText(phone, t(await userLang(phone), 'unsupported_media'));
              }
              continue;
            }
            await processIncoming(phone, text, id, replyId);
            console.log('[WHATSAPP] Processed message', id);
          } catch (error: any) {
            console.error('[WHATSAPP ERROR] Processing failed:', error?.message, error?.response?.data ? JSON.stringify(error.response.data) : '', error?.stack);
            const lang = await userLang(phone);
            await sendWhatsAppText(phone, t(lang, 'processing_error', { support: t(lang, 'support') })).catch(() => undefined);
          }
        }
      }
    }
  } catch (error: any) {
    console.error('[WHATSAPP ERROR] Unexpected failure:', error?.message, error?.stack);
  }
  return res.sendStatus(200);
});

/* ================================================================== RAZORPAY */

const nonEmpty = <T>(v: T | undefined | null | ''): v is T => v !== undefined && v !== null && v !== '';

async function settleLinkPayment(p: { linkId?: string; notes?: any; paidPaise: number; paymentId?: string }) {
  const orderNumber = nonEmpty(p.notes?.orderNumber) ? String(p.notes.orderNumber) : undefined;
  const donationId = nonEmpty(p.notes?.donationId) ? String(p.notes.donationId) : undefined;
  const linkId = nonEmpty(p.linkId) ? String(p.linkId) : undefined;
  if (!linkId && !orderNumber && !donationId) return;

  const orderOr: Prisma.OrderWhereInput[] = [];
  if (linkId) orderOr.push({ razorpayOrderId: linkId });
  if (orderNumber) orderOr.push({ orderNumber });
  const donationOr: Prisma.DonationWhereInput[] = [];
  if (linkId) donationOr.push({ razorpayOrderId: linkId });
  if (donationId) donationOr.push({ id: donationId });

  const orders = await db.order.findMany({ where: { OR: orderOr } });
  const donations = await db.donation.findMany({ where: { OR: donationOr } });
  if (!orders.length && !donations.length) console.error('[RAZORPAY WEBHOOK] Payment Link matched nothing:', { linkId, orderNumber, donationId });

  for (const order of orders) {
    if (p.paidPaise >= order.total * 100) await markOrderPaid(order.id, p.paymentId || '');
    else console.error('[RAZORPAY WEBHOOK] Amount mismatch for order', order.orderNumber, p.paidPaise, '<', order.total * 100);
  }
  for (const d of donations) {
    if (p.paidPaise >= d.amount * 100) {
      await markDonationPaid(d.id, p.paymentId);
      await deliverDonationReceipt(d.id); // exactly-once; also retries a previously failed delivery
    } else console.error('[RAZORPAY WEBHOOK] Amount mismatch for donation', d.reference, p.paidPaise, '<', d.amount * 100);
  }
}

async function settleCheckoutPayment(p: { orderId: string; paidPaise: number; currency?: string; paymentId?: string }) {
  // NEVER query with an empty id: Prisma treats `undefined` as "no filter" and would match every row.
  if (!nonEmpty(p.orderId)) return;
  const orders = await db.order.findMany({ where: { razorpayOrderId: p.orderId } });
  for (const order of orders) {
    if (p.paidPaise >= order.total * 100 && (!p.currency || p.currency === order.currency)) await markOrderPaid(order.id, p.paymentId || '');
    else console.error('[RAZORPAY WEBHOOK] Amount/currency mismatch for order', order.orderNumber);
  }
  const donations = await db.donation.findMany({ where: { razorpayOrderId: p.orderId } });
  for (const d of donations) {
    if (p.paidPaise >= d.amount * 100 && (!p.currency || p.currency === d.currency)) {
      await markDonationPaid(d.id, p.paymentId);
      await deliverDonationReceipt(d.id);
    } else console.error('[RAZORPAY WEBHOOK] Amount/currency mismatch for donation', d.reference);
  }
}

r.post('/razorpay', async (req: Request, res: Response) => {
  try {
    const raw = (req as any).rawBody as string | undefined;
    const sig = String(req.headers['x-razorpay-signature'] || '');
    if (!raw || !verifySignature(raw, sig)) {
      console.error('[RAZORPAY WEBHOOK] Signature verification FAILED. Check RAZORPAY_WEBHOOK_SECRET matches the secret set on the Razorpay webhook.');
      return res.status(400).send('Invalid signature');
    }

    const event = String(req.body?.event || 'unknown');
    const eventId = String(req.headers['x-razorpay-event-id'] || crypto.createHash('sha256').update(raw).digest('hex'));
    const payment = req.body?.payload?.payment?.entity;
    const link = req.body?.payload?.payment_link?.entity;
    const rzpOrder = req.body?.payload?.order?.entity;
    console.log('[RAZORPAY WEBHOOK] Received', event, 'eventId:', eventId, 'payment:', payment?.id, 'order:', payment?.order_id ?? rzpOrder?.id, 'link:', link?.id ?? payment?.payment_link_id);

    if (event === 'payment_link.paid') {
      await settleLinkPayment({
        linkId: link?.id ?? payment?.payment_link_id,
        notes: link?.notes,
        paidPaise: Number(link?.amount_paid ?? payment?.amount ?? 0),
        paymentId: payment?.id ? String(payment.id) : undefined,
      });
    } else if (event === 'payment.captured' || event === 'order.paid') {
      const paidPaise = Number(payment?.amount ?? rzpOrder?.amount_paid ?? 0);
      const orderId = String(payment?.order_id ?? rzpOrder?.id ?? '');
      await settleCheckoutPayment({ orderId, paidPaise, currency: payment?.currency, paymentId: payment?.id ? String(payment.id) : undefined });
      if (nonEmpty(payment?.payment_link_id)) {
        await settleLinkPayment({ linkId: String(payment.payment_link_id), notes: payment?.notes, paidPaise, paymentId: payment?.id ? String(payment.id) : undefined });
      }
      // Payment Link payments reference Razorpay's internal order id (which we never stored), so also ask
      // Razorpay directly about our pending links. Fire-and-forget to keep the webhook response fast.
      void sweepPendingPayments('webhook');
    } else if (event === 'payment.failed') {
      const orderId = String(payment?.order_id ?? '');
      // Payment Links stay payable after one failed attempt, so only website-checkout orders (order_...) are marked.
      if (orderId.startsWith('order_')) {
        await db.order.updateMany({ where: { razorpayOrderId: orderId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } });
        await db.donation.updateMany({ where: { razorpayOrderId: orderId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } });
      }
    }

    await db.webhookEvent.upsert({
      where: { eventId },
      create: { provider: 'razorpay', eventId, payload: req.body, processed: true },
      update: { processed: true },
    });
    return res.sendStatus(200);
  } catch (error: any) {
    console.error('[RAZORPAY WEBHOOK ERROR]', error);
    return res.status(500).json({ error: 'Razorpay webhook failed' });
  }
});

/* ================================================================== SHIPROCKET */

r.post('/shiprocket', async (req: Request, res: Response) => {
  try {
    if (env.SHIPROCKET_WEBHOOK_TOKEN && req.headers['x-api-key'] !== env.SHIPROCKET_WEBHOOK_TOKEN) {
      return res.sendStatus(401);
    }
    const awb = String(req.body?.awb || req.body?.awb_code || req.body?.shipment_track?.[0]?.awb_code || '');
    const status = String(req.body?.current_status || req.body?.status || req.body?.shipment_track?.[0]?.current_status || '').toUpperCase();
    if (!awb) return res.sendStatus(200);

    const order = await db.order.findFirst({ where: { awb } });
    if (!order) return res.sendStatus(200);

    const statusMap: Record<string, string> = {
      DELIVERED: 'DELIVERED', 'OUT FOR DELIVERY': 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
      SHIPPED: 'SHIPPED', 'IN TRANSIT': 'SHIPPED', CANCELLED: 'CANCELLED',
    };
    const nextStatus = statusMap[status];
    if (nextStatus && nextStatus !== order.status) {
      await db.order.update({ where: { id: order.id }, data: { status: nextStatus as any } });
      if (nextStatus === 'DELIVERED' || nextStatus === 'OUT_FOR_DELIVERY') {
        const user = await db.user.findUnique({ where: { id: order.userId } });
        if (user?.phone) {
          const msg = t(normalizeLang(user.language), nextStatus === 'DELIVERED' ? 'ship_delivered' : 'ship_ofd', { number: order.orderNumber });
          await sendWhatsAppText(user.phone, msg).catch((error) => console.error('[SHIPROCKET WHATSAPP ERROR]', error?.response?.data || error?.message || error));
        }
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    console.error('[SHIPROCKET WEBHOOK ERROR]', error);
    return res.sendStatus(200);
  }
});

export default r;

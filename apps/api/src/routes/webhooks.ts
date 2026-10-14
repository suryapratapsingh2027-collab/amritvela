
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { env } from '../config';
import { verifySignature } from '../integrations/razorpay';
import { sendWhatsAppText } from '../integrations/whatsapp';
import { markOrderPaid } from '../services/fulfillment';
import { answer, knowledge } from '../services/ai';

const r = Router();

/**
 * WHATSAPP WEBHOOK VERIFICATION
 * Meta sends a GET request when verifying the callback URL.
 */
r.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    token === env.WHATSAPP_VERIFY_TOKEN &&
    typeof challenge === 'string'
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/**
 * WHATSAPP INCOMING MESSAGES
 */
r.post('/whatsapp', async (req: Request, res: Response) => {
  console.log('[WHATSAPP WEBHOOK] POST received');
  console.log('[WHATSAPP WEBHOOK] Object:', req.body?.object);
  
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  
  console.log('[WHATSAPP WEBHOOK] Value found:', Boolean(value));
  console.log(
    '[WHATSAPP WEBHOOK] Message count:',
    value?.messages?.length ?? 0
  );
console.log(
  '[WHATSAPP WEBHOOK] Message type:',
  value?.messages?.[0]?.type ?? 'none'
);
  const message = value?.messages?.[0];

  // Meta also sends status updates through this webhook.
  // Acknowledge events that are not incoming messages.
  if (!message?.from || message.type !== 'text') {
    return res.sendStatus(200);
  }

  const phone = String(message.from);
  const text = String(message.text?.body || '').trim();
  const whatsappMessageId = String(message.id || '');

  if (!text) {
    return res.sendStatus(200);
  }

  try {
    // Avoid replying more than once to the same WhatsApp message.
    // This uses the existing message table and metadata field.
    if (whatsappMessageId) {
      const duplicate = await db.message.findFirst({
        where: {
          metadata: {
            path: ['whatsappMessageId'],
            equals: whatsappMessageId,
          },
        },
      });

      if (duplicate) {
        return res.sendStatus(200);
      }
    }

    const user = await db.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });
     console.log('[WHATSAPP] User created/found');

    let conversation = await db.conversation.findFirst({
      where: { userId: user.id },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (!conversation) {
      conversation = await db.conversation.create({
        data: { userId: user.id },
      });
    }

    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'IN',
        text,
        metadata: whatsappMessageId
          ? { whatsappMessageId }
          : undefined,
      },
    });
    console.log('[WHATSAPP] Incoming message saved');

    console.log('[WHATSAPP] Calling AI');
    const out = await answer(text, await knowledge());
    console.log('[WHATSAPP] AI completed; intent:', out.intent);

    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        mode:
          out.intent === 'HUMAN'
            ? 'HUMAN'
            : conversation.mode,
        lastMessageAt: new Date(),
      },
    });

    if (out.intent === 'HUMAN') {
      const existingTicket = await db.supportTicket.findFirst({
        where: {
          conversationId: conversation.id,
          status: 'OPEN',
        },
      });

      if (!existingTicket) {
        await db.supportTicket.create({
          data: {
            conversationId: conversation.id,
            subject: 'Human support requested',
          },
        });
      }
    }

    // Send the generated answer to the WhatsApp customer.
    console.log('[WHATSAPP] Sending reply');
    await sendWhatsAppText(phone, out.text);
    console.log('[WHATSAPP] Reply sent successfully');

    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        text: out.text,
        metadata: { intent: out.intent },
      },
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error('WhatsApp webhook processing failed:', error);

    // A non-2xx response allows Meta to retry the webhook.
    // Duplicate protection above helps prevent repeat processing.
    return res.sendStatus(500);
  }
});

/**
 * RAZORPAY WEBHOOK
 */
r.post('/razorpay', async (req: Request, res: Response) => {
  try {
    const sig = String(req.headers['x-razorpay-signature'] || '');

    if (
      !verifySignature(
        (req as any).rawBody || JSON.stringify(req.body),
        sig
      )
    ) {
      return res.status(400).send('Invalid signature');
    }

    const eventId = String(
      req.body?.id || `${req.body?.event}-${Date.now()}`
    );

    if (await db.webhookEvent.findUnique({ where: { eventId } })) {
      return res.sendStatus(200);
    }

    await db.webhookEvent.create({
      data: {
        provider: 'razorpay',
        eventId,
        payload: req.body,
      },
    });

    const event = req.body?.event;
    const payment = req.body?.payload?.payment?.entity;

    if (event === 'payment.captured' && payment) {
      const orders = await db.order.findMany({
        where: { razorpayOrderId: payment.order_id },
      });

      for (const order of orders) {
        await markOrderPaid(order.id, payment.id);
      }

      await db.donation.updateMany({
        where: { razorpayOrderId: payment.order_id },
        data: {
          paymentStatus: 'PAID',
          razorpayPaymentId: payment.id,
        },
      });
    }

    if (event === 'payment.failed' && payment) {
      await db.order.updateMany({
        where: { razorpayOrderId: payment.order_id },
        data: { paymentStatus: 'FAILED' },
      });

      await db.donation.updateMany({
        where: { razorpayOrderId: payment.order_id },
        data: { paymentStatus: 'FAILED' },
      });
    }

    return res.sendStatus(200);
  } catch (error: any) {
    console.error('Razorpay webhook failed:', error);
    return res.status(500).json({
      error: error.message || 'Razorpay webhook failed',
    });
  }
});

/**
 * SHIPROCKET WEBHOOK
 */
r.post('/shiprocket', async (req: Request, res: Response) => {
  try {
    const awb = String(
      req.body?.awb ||
        req.body?.awb_code ||
        req.body?.shipment_track?.[0]?.awb_code ||
        ''
    );

    const status = String(
      req.body?.current_status ||
        req.body?.status ||
        req.body?.shipment_track?.[0]?.current_status ||
        ''
    ).toUpperCase();

    if (!awb) {
      return res.sendStatus(200);
    }

    const order = await db.order.findFirst({ where: { awb } });

    if (!order) {
      return res.sendStatus(200);
    }

    const statusMap: Record<string, string> = {
      DELIVERED: 'DELIVERED',
      'OUT FOR DELIVERY': 'OUT_FOR_DELIVERY',
      OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
      SHIPPED: 'SHIPPED',
      'IN TRANSIT': 'SHIPPED',
      CANCELLED: 'CANCELLED',
    };

    const nextStatus = statusMap[status];

    if (nextStatus) {
      await db.order.update({
        where: { id: order.id },
        data: { status: nextStatus as any },
      });

      if (
        nextStatus === 'DELIVERED' ||
        nextStatus === 'OUT_FOR_DELIVERY'
      ) {
        const user = await db.user.findUnique({
          where: { id: order.userId },
        });

        if (user?.phone) {
          await sendWhatsAppText(
            user.phone,
            `Order ${order.orderNumber}: ${status.toLowerCase()}.`
          ).catch((error) => {
            console.error('Shiprocket WhatsApp notification failed:', error);
          });
        }
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Shiprocket webhook failed:', error);
    return res.sendStatus(200);
  }
});

export default r;

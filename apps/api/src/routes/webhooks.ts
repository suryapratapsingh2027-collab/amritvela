
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
    console.log('[WHATSAPP WEBHOOK] Verification successful');
    return res.status(200).send(challenge);
  }

  console.error('[WHATSAPP WEBHOOK] Verification failed');
  return res.sendStatus(403);
});

/**
 * WHATSAPP INCOMING MESSAGES
 */
r.post('/whatsapp', async (req: Request, res: Response) => {
  console.log('[WHATSAPP 1] POST received');
  console.log('[WHATSAPP 2] Object:', req.body?.object);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    console.log('[WHATSAPP 3] Value found:', Boolean(value));
    console.log(
      '[WHATSAPP 4] Message count:',
      value?.messages?.length ?? 0
    );
    console.log(
      '[WHATSAPP 5] Message type:',
      message?.type ?? 'none'
    );

    // Status notifications do not contain an incoming customer message.
    if (!message?.from || message.type !== 'text') {
      console.log(
        '[WHATSAPP] Skipping status/non-text event'
      );
      return res.sendStatus(200);
    }

    const phone = String(message.from);
    const text = String(message.text?.body || '').trim();
    const whatsappMessageId = String(message.id || '');

    console.log('[WHATSAPP 6] Incoming text validated');

    if (!text) {
      console.log('[WHATSAPP] Empty text; skipping');
      return res.sendStatus(200);
    }

    // Avoid processing the same incoming message twice.
    if (whatsappMessageId) {
      console.log('[WHATSAPP 7] Checking duplicate message');

      const duplicate = await db.message.findFirst({
        where: {
          metadata: {
            path: ['whatsappMessageId'],
            equals: whatsappMessageId,
          },
        },
      });

      if (duplicate) {
        console.log('[WHATSAPP] Duplicate message; skipping');
        return res.sendStatus(200);
      }

      console.log('[WHATSAPP 8] Duplicate check passed');
    }

    // Find or create customer.
    console.log('[WHATSAPP 9] Finding/creating user');

    const user = await db.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });

    console.log('[WHATSAPP 10] User created/found:', user.id);

    // Find or create conversation.
    console.log('[WHATSAPP 11] Finding conversation');

    let conversation = await db.conversation.findFirst({
      where: { userId: user.id },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (!conversation) {
      console.log('[WHATSAPP 12] Creating conversation');

      conversation = await db.conversation.create({
        data: { userId: user.id },
      });

      console.log(
        '[WHATSAPP 13] Conversation created:',
        conversation.id
      );
    } else {
      console.log(
        '[WHATSAPP 13] Existing conversation:',
        conversation.id
      );
    }

    // Save incoming message.
    console.log('[WHATSAPP 14] Saving incoming message');

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

    console.log('[WHATSAPP 15] Incoming message saved');

    // Generate AI response.
    console.log('[WHATSAPP 16] Loading AI knowledge');

    const knowledgeData = await knowledge();

    console.log('[WHATSAPP 17] Knowledge loaded');
    console.log('[WHATSAPP 18] Calling AI');

    const out = await answer(text, knowledgeData);

    console.log(
      '[WHATSAPP 19] AI completed; intent:',
      out.intent
    );
    console.log(
      '[WHATSAPP 20] AI response available:',
      Boolean(out.text?.trim())
    );

    if (!out.text?.trim()) {
      throw new Error('AI returned an empty response');
    }

    // Update conversation.
    console.log('[WHATSAPP 21] Updating conversation');

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

    console.log('[WHATSAPP 22] Conversation updated');

    // Create a support ticket when human support is requested.
    if (out.intent === 'HUMAN') {
      console.log('[WHATSAPP 23] Checking support ticket');

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

        console.log('[WHATSAPP 24] Support ticket created');
      } else {
        console.log('[WHATSAPP 24] Open ticket already exists');
      }
    }

    // Send WhatsApp reply.
    console.log('[WHATSAPP 25] Sending WhatsApp reply');

    const sendResult = await sendWhatsAppText(
      phone,
      out.text
    );

    console.log(
      '[WHATSAPP 26] WhatsApp API call returned:',
      JSON.stringify(sendResult)
    );

    // Save outgoing message after sending.
    console.log('[WHATSAPP 27] Saving outgoing message');

    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        text: out.text,
        metadata: {
          intent: out.intent,
          whatsappMessageId,
        },
      },
    });

    console.log('[WHATSAPP 28] Outgoing message saved');
    console.log('[WHATSAPP SUCCESS] Processing completed');

    return res.sendStatus(200);
  } catch (error: any) {
    console.error('[WHATSAPP ERROR] Processing failed');
    console.error('[WHATSAPP ERROR] Message:', error?.message);
    console.error('[WHATSAPP ERROR] Code:', error?.code);
    console.error('[WHATSAPP ERROR] Stack:', error?.stack);

    if (error?.response) {
      console.error(
        '[WHATSAPP ERROR] HTTP status:',
        error.response.status
      );
      console.error(
        '[WHATSAPP ERROR] API response:',
        JSON.stringify(error.response.data)
      );
    }

    // Return 500 so Meta can retry transient failures.
    return res.sendStatus(500);
  }
});

/**
 * RAZORPAY WEBHOOK
 */
r.post('/razorpay', async (req: Request, res: Response) => {
  try {
    const sig = String(
      req.headers['x-razorpay-signature'] || ''
    );

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
    console.error('[RAZORPAY WEBHOOK ERROR]', error);

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
            console.error(
              '[SHIPROCKET WHATSAPP ERROR]',
              error?.response?.data || error?.message || error
            );
          });
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

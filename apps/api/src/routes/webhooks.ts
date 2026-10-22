
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { env } from '../config';
import { verifySignature } from '../integrations/razorpay';
import { sendWhatsAppText } from '../integrations/whatsapp';
import { markOrderPaid } from '../services/fulfillment';
import { answer, knowledge } from '../services/ai';
import { createAndSendDonationLink } from '../services/donation-payment-link';
import { sendWhatsAppDocument } from '../integrations/whatsapp';
import { handleWhatsAppShop } from '../services/whatsapp-shop';

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
    console.log('[WHATSAPP] Verification successful');
    return res.status(200).send(challenge);
  }

  console.error('[WHATSAPP] Verification failed');
  return res.sendStatus(403);
});

/**
 * WHATSAPP INCOMING MESSAGES
 */
r.post('/whatsapp', async (req: Request, res: Response) => {
  console.log('[WHATSAPP 1] POST received');

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    console.log('[WHATSAPP 2] Object:', req.body?.object);
    console.log('[WHATSAPP 3] Value found:', Boolean(value));
    console.log(
      '[WHATSAPP 4] Message count:',
      value?.messages?.length ?? 0
    );
    console.log(
      '[WHATSAPP 5] Message type:',
      message?.type ?? 'none'
    );

    // Ignore delivery/read status events and unsupported message types.
    if (!message?.from || message.type !== 'text') {
      console.log('[WHATSAPP] Ignoring status/non-text event');
      return res.sendStatus(200);
    }

    const phone = String(message.from);
    console.log('[WHATSAPP DEBUG] Incoming sender:', phone);
console.log('[WHATSAPP DEBUG] Business phone number ID:', value?.metadata?.phone_number_id);
    const text = String(message.text?.body || '').trim();
    const whatsappMessageId = String(message.id || '');

    if (!text) {
      console.log('[WHATSAPP] Empty message; skipping');
      return res.sendStatus(200);
    }

    console.log('[WHATSAPP 6] Incoming text validated');
    console.log(
      '[WHATSAPP 7] Message ID:',
      whatsappMessageId || '(missing)'
    );

    /*
     * IMPORTANT:
     * Skip only when an OUT message confirms that a reply was already
     * sent for this WhatsApp message ID.
     *
     * An IN record alone must not block retries after AI/send failures.
     */
    if (whatsappMessageId) {
      console.log('[WHATSAPP 8] Checking for an existing reply');

      const existingReply = await db.message.findFirst({
        where: {
          direction: 'OUT',
          metadata: {
            path: ['whatsappMessageId'],
            equals: whatsappMessageId,
          },
        },
      });

      if (existingReply) {
        console.log(
          '[WHATSAPP] Reply already recorded; skipping duplicate'
        );
        return res.sendStatus(200);
      }

      console.log('[WHATSAPP 9] No previous reply found');
    }

    // Find or create the customer.
    console.log('[WHATSAPP 10] Finding/creating user');

    const user = await db.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });

    console.log('[WHATSAPP 11] User ready:', user.id);

    // Find or create the conversation.
    let conversation = await db.conversation.findFirst({
      where: { userId: user.id },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (!conversation) {
      console.log('[WHATSAPP 12] Creating conversation');

      conversation = await db.conversation.create({
        data: { userId: user.id },
      });
    }

    console.log(
      '[WHATSAPP 13] Conversation ready:',
      conversation.id
    );

    /*
     * Save the incoming message only if it has not already been saved.
     * This allows a retry to continue after an earlier processing failure.
     */
    let incomingAlreadySaved = false;

    if (whatsappMessageId) {
      const existingIncoming = await db.message.findFirst({
        where: {
          direction: 'IN',
          metadata: {
            path: ['whatsappMessageId'],
            equals: whatsappMessageId,
          },
        },
      });

      incomingAlreadySaved = Boolean(existingIncoming);
    }

    if (!incomingAlreadySaved) {
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
    } else {
      console.log(
        '[WHATSAPP 15] Incoming message already saved; continuing'
      );
    }

    // Deterministic product checkout runs before the general AI response. It uses
    // saved conversation messages so a multi-message WhatsApp checkout survives restarts.
    const shopReply = await handleWhatsAppShop(phone, text, conversation.id);
    if (shopReply) {
      await sendWhatsAppText(phone, shopReply);
      await db.message.create({
        data: { conversationId: conversation.id, direction: 'OUT', text: shopReply, metadata: { intent: 'SHOP', whatsappMessageId } },
      });
      await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
      return res.sendStatus(200);
    }

    // Explicit donation requests with an amount create a real backend Payment Link.
    // Keep the normal AI flow for donation questions without an amount and all other intents.
    const donationIntent = /\b(donat(?:e|ion|ing)?|daan|chanda|contribut(?:e|ion)?|योगदान|दान)\b/i.test(text);
    const amountMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?:\s*(?:rs\.?|rupees?|rupaye|inr))?/i);
    if (donationIntent && amountMatch) {
      const amount = Number(amountMatch[1].replace(/,/g, ''));
      const user = await db.user.findUnique({ where: { phone } });
      const result = await createAndSendDonationLink({ phone, name: user?.name, email: user?.email, amount });
      await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
      await db.message.create({ data: { conversationId: conversation.id, direction: 'OUT', text: result.message, metadata: { intent: 'DONATION', whatsappMessageId, donationReference: result.reference, paymentLinkId: result.paymentLinkId } } });
      console.log('[WHATSAPP DONATION] Payment link created and sent:', result.reference);
      return res.sendStatus(200);
    }

    // Generate AI response.
    console.log('[WHATSAPP 16] Loading AI knowledge');

    const knowledgeData = await knowledge();

    console.log('[WHATSAPP 17] Knowledge loaded');
    console.log('[WHATSAPP 18] Calling AI');

    const out = await answer(text, knowledgeData, phone);

    console.log(
      '[WHATSAPP 19] AI completed; intent:',
      out.intent
    );

    if (!out.text?.trim()) {
      throw new Error('AI returned an empty response');
    }

    console.log('[WHATSAPP 20] Updating conversation');

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

    console.log('[WHATSAPP 21] Conversation updated');

    // Create a support ticket if human support is requested.
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

        console.log('[WHATSAPP 22] Support ticket created');
      }
    }

    // Send the reply.
    console.log('[WHATSAPP 23] Sending WhatsApp reply');

    const sendResult = await sendWhatsAppText(phone, out.text);

    console.log(
      '[WHATSAPP 24] WhatsApp API returned:',
      JSON.stringify(sendResult)
    );

    /*
     * Save OUT only after the send function succeeds.
     * Keep the incoming WhatsApp ID on the OUT record for idempotency.
     */
    console.log('[WHATSAPP 25] Saving outgoing message');

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

    console.log('[WHATSAPP 26] Outgoing message saved');
    console.log('[WHATSAPP SUCCESS] Processing completed');

    return res.sendStatus(200);
  } catch (error: any) {
    console.error('[WHATSAPP ERROR] Processing failed');
    console.error('[WHATSAPP ERROR] Message:', error?.message);
    console.error('[WHATSAPP ERROR] Code:', error?.code);

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

    console.error('[WHATSAPP ERROR] Stack:', error?.stack);

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

    // Razorpay Payment Links emit payment_link.paid. Verify the webhook signature above,
    // then reconcile by the Payment Link ID stored on the donation.
    if (event === 'payment_link.paid') {
      const paymentLink = req.body?.payload?.payment_link?.entity;
      const linkedPayment = req.body?.payload?.payment?.entity;
      const paymentLinkId = String(paymentLink?.id || linkedPayment?.payment_link_id || '');
      if (paymentLinkId) {
        const linkedOrder = await db.order.findFirst({ where: { razorpayOrderId: paymentLinkId }, include: { user: true } });
        if (linkedOrder && linkedOrder.paymentStatus !== 'PAID') {
          const paidAmount = Number(paymentLink?.amount_paid ?? linkedPayment?.amount ?? 0);
          if (paidAmount >= linkedOrder.total * 100) {
            await db.order.update({ where: { id: linkedOrder.id }, data: { paymentStatus: 'PAID', status: 'CONFIRMED', razorpayPaymentId: linkedPayment?.id ? String(linkedPayment.id) : undefined } });
            await sendWhatsAppText(linkedOrder.user.phone, `Dhanyavaad! Aapka payment verify ho gaya hai. Order ${linkedOrder.orderNumber} confirm hai. Dispatch hone par tracking details share ki jayengi.`);
          } else {
            console.error('[RAZORPAY WEBHOOK] Payment Link amount does not match order:', linkedOrder.orderNumber);
          }
        }
        const donation = await db.donation.findFirst({ where: { razorpayOrderId: paymentLinkId }, include: { user: true } });
        if (donation && donation.paymentStatus !== 'PAID') {
          const paidAmount = Number(paymentLink?.amount_paid ?? linkedPayment?.amount ?? 0);
          if (paidAmount >= donation.amount * 100) {
            const updated = await db.donation.update({ where: { id: donation.id }, data: { paymentStatus: 'PAID', razorpayPaymentId: linkedPayment?.id ? String(linkedPayment.id) : undefined }, include: { user: true } });
            const receiptUrl = `${env.API_URL}/api/donations/${updated.id}/receipt`;
            await db.donation.update({ where: { id: updated.id }, data: { receiptUrl } });
            await sendWhatsAppText(updated.user.phone, `Dhanyavaad! Aapka ₹${updated.amount} donation confirm ho gaya hai. Reference: ${updated.reference}. Aapki PDF receipt ab bheji ja rahi hai.`);
            await sendWhatsAppDocument(updated.user.phone, receiptUrl, `${updated.reference}.pdf`);
          } else {
            console.error('[RAZORPAY WEBHOOK] Payment Link amount does not match donation:', donation.reference);
          }
        }
      }
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

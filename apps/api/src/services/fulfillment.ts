
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { createShipment } from '../integrations/shiprocket';
import { createWooOrder } from '../integrations/woocommerce';
import {
  sendWhatsAppText,
  sendWhatsAppDocument,
  sendWhatsAppPdf,
} from '../integrations/whatsapp';
import { makeInvoice } from './receipt';
import { env } from '../config';

/**
 * Marks an order paid exactly once, no matter how many times it is called
 * (webhook retries, payment.captured + payment_link.paid arriving together, the reconcile sweep, ...).
 * Side effects (stock, WhatsApp confirmation, invoice) only run for the call that wins the claim.
 */
export async function markOrderPaid(orderId: string, paymentId: string) {
  const claimed = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: { not: 'PAID' } },
      data: { paymentStatus: 'PAID', status: 'CONFIRMED', razorpayPaymentId: paymentId || undefined, paidAt: new Date() },
    });
    if (claim.count === 0) return false;

    const items = await tx.orderItem.findMany({ where: { orderId }, include: { product: true } });
    for (const item of items) {
      // The customer has already paid, so never throw here. Decrement what we can and flag an oversell.
      const dec = await tx.product.updateMany({ where: { id: item.productId, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } });
      if (dec.count === 0) {
        await tx.product.updateMany({ where: { id: item.productId }, data: { stock: 0 } });
        console.error(`[STOCK OVERSELL] Order ${orderId}: ${item.product.name} x${item.quantity} paid but stock was insufficient. Admin must arrange fulfilment or refund.`);
      }
    }
    return true;
  });

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { user: true, items: { include: { product: true } } },
  });
  if (!order) throw new Error('Order not found');
  if (!claimed) return order;

  try {
    const woo = await createWooOrder({
      orderNumber: order.orderNumber,
      customer: order.user,
      address: order.address,
      items: order.items.map((i) => ({ product_id: i.productId, name: i.product.name, quantity: i.quantity, price: i.unitPrice })),
      total: order.total,
    });
    await db.order.update({ where: { id: order.id }, data: { wooOrderId: String((woo as any).id || '') } });
  } catch (e) {
    console.error('WooCommerce sync failed:', e);
  }

  await sendWhatsAppText(
    order.user.phone,
    `Dhanyavaad! Aapka payment verify ho gaya hai.\nOrder ${order.orderNumber} confirm hai (Total ₹${order.total.toLocaleString('en-IN')}). Dispatch hone par tracking details isi WhatsApp par share ki jayengi.`,
  ).catch((e) => console.error('[ORDER PAID] WhatsApp confirmation failed:', e?.message || e));

  await sendOrderInvoice(order.id).catch((e) => console.error('[ORDER PAID] Invoice delivery failed:', e?.message || e));
  return order;
}

export async function sendOrderInvoice(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: { user: true, items: { include: { product: true } } } });
  if (!o || o.paymentStatus !== 'PAID') throw new Error('Invoice is available only for paid orders');
  const addr = (o.address as any)?.full ? String((o.address as any).full) : null;
  const pdf = await makeInvoice({
    orderNumber: o.orderNumber, name: o.user.name, phone: o.user.phone,
    items: o.items.map((i) => ({ name: i.product.name, quantity: i.quantity, unitPrice: i.unitPrice })),
    subtotal: o.subtotal, shippingFee: o.shippingFee, total: o.total, paymentStatus: o.paymentStatus,
    paymentId: o.razorpayPaymentId, paidAt: o.paidAt, address: addr,
  });
  try {
    await sendWhatsAppPdf(o.user.phone, pdf, `${o.orderNumber}.pdf`, `Invoice ${o.orderNumber}`);
  } catch {
    await sendWhatsAppDocument(o.user.phone, `${env.API_URL}/api/orders/${o.id}/invoice`, `${o.orderNumber}.pdf`);
  }
}

export async function shipOrder(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      items: { include: { product: true } },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  if (order.paymentStatus !== 'PAID') {
    throw new Error('Order must be paid before shipping');
  }

  const shipment = await createShipment({
    order_id: order.orderNumber,
    order_date: order.createdAt,
    channel_id: '',
    billing_customer_name: order.user.name || 'Customer',
    billing_address: order.address,
    shipping_is_billing: true,
    order_items: order.items.map(
      (i: {
        product: { name: string };
        quantity: number;
        unitPrice: number;
      }) => ({
        name: i.product.name,
        selling_price: i.unitPrice,
        units: i.quantity,
        sac: '',
        discount: '',
        tax: '',
        hsn: '',
      })
    ),
    sub_total: order.subtotal,
    length: 10,
    breadth: 10,
    height: 10,
    weight: 0.5,
    pickup_location: 'Primary',
  });

  const awb = (shipment as any).awb_code || '';

  const updated = await db.order.update({
    where: { id: order.id },
    data: {
      status: 'SHIPPED',
      shiprocketOrderId: String((shipment as any).order_id || ''),
      awb: String(awb),
      courier: String((shipment as any).courier_name || ''),
      trackingUrl: awb ? `https://shiprocket.co/tracking/${awb}` : null,
    },
  });

  await sendWhatsAppText(
    order.user.phone,
    `Your order ${order.orderNumber} has shipped.${awb ? ` AWB: ${awb}` : ''}`
  ).catch(() => undefined);

  return updated;
}
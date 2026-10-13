import { db } from '../db';
import { createShipment } from '../integrations/shiprocket';
import { createWooOrder } from '../integrations/woocommerce';
import { sendWhatsAppText, sendWhatsAppDocument } from '../integrations/whatsapp';
import { env } from '../config';

export async function markOrderPaid(orderId: string, paymentId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { user: true, items: { include: { product: true } } } });
  if (!order) throw new Error('Order not found');
  if (order.paymentStatus === 'PAID') return order;
  const updated = await db.$transaction(async (tx) => {
    for (const item of order.items) {
      const p = await tx.product.findUnique({ where: { id: item.productId } });
      if (!p || p.stock < item.quantity) throw new Error(`Insufficient stock for ${item.product.name}`);
      await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: item.quantity } } });
    }
    return tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', status: 'CONFIRMED', razorpayPaymentId: paymentId }, include: { user: true, items: { include: { product: true } } } });
  });
  try {
    const woo = await createWooOrder({ orderNumber: updated.orderNumber, customer: updated.user, address: updated.address, items: updated.items.map(i => ({ product_id: i.productId, name: i.product.name, quantity: i.quantity, price: i.unitPrice })), total: updated.total });
    await db.order.update({ where: { id: updated.id }, data: { wooOrderId: String((woo as any).id || '') } });
  } catch (e) { console.error('WooCommerce sync failed:', e); }
  const invoiceUrl = `${env.API_URL}/api/orders/${updated.id}/invoice`;
  await db.order.update({ where: { id: updated.id }, data: { trackingUrl: updated.trackingUrl || null } }).catch(() => undefined);
  await sendWhatsAppText(updated.user.phone, `Payment received for ${updated.orderNumber}. Your order is confirmed.`).catch(() => undefined);
  await sendWhatsAppDocument(updated.user.phone, invoiceUrl, `${updated.orderNumber}.pdf`).catch(() => undefined);
  return updated;
}

export async function shipOrder(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { user: true, items: { include: { product: true } } } });
  if (!order) throw new Error('Order not found');
  if (order.paymentStatus !== 'PAID') throw new Error('Order must be paid before shipping');
  const shipment = await createShipment({
    order_id: order.orderNumber, order_date: order.createdAt, channel_id: '',
    billing_customer_name: order.user.name || 'Customer', billing_address: order.address,
    shipping_is_billing: true, order_items: order.items.map(i => ({ name: i.product.name, selling_price: i.unitPrice, units: i.quantity, sac: '', discount: '', tax: '', hsn: '' })),
    sub_total: order.subtotal, length: 10, breadth: 10, height: 10, weight: 0.5, pickup_location: 'Primary'
  });
  const awb = (shipment as any).awb_code || '';
  const updated = await db.order.update({ where: { id: order.id }, data: { status: 'SHIPPED', shiprocketOrderId: String((shipment as any).order_id || ''), awb: String(awb), courier: String((shipment as any).courier_name || ''), trackingUrl: awb ? `https://shiprocket.co/tracking/${awb}` : null } });
  await sendWhatsAppText(order.user.phone, `Your order ${order.orderNumber} has shipped.${awb ? ` AWB: ${awb}` : ''}`).catch(() => undefined);
  return updated;
}

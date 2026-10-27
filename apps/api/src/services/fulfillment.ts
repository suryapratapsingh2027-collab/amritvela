
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { assignAwb, createShipment, getPickupLocation } from '../integrations/shiprocket';
import { createWooOrder } from '../integrations/woocommerce';
import {
  sendWhatsAppText,
  sendWhatsAppDocument,
  sendWhatsAppPdf,
} from '../integrations/whatsapp';
import { makeInvoice } from './receipt';
import { addressText, extractPin, guessStateCity, indianMobile, lookupPin, splitName } from './shipping-address';
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
    include: { user: true, items: { include: { product: true } } },
  });
  if (!order) throw new Error('Order not found');
  if (order.paymentStatus !== 'PAID') throw new Error('Order must be paid before shipping');
  if (order.awb) return order; // already shipped; never create a duplicate Shiprocket order

  let shiprocketOrderId = order.shiprocketOrderId;
  let shipmentId = order.shiprocketShipmentId;
  let awb = '';
  let courier = '';

  if (!shipmentId) {
    const full = addressText(order.address);
    const pin = (order.address as any)?.pin && /^\d{6}$/.test(String((order.address as any).pin)) ? String((order.address as any).pin) : extractPin(full);
    if (!full || full.length < 8) throw new Error('Order address is missing or too short. Edit the order address before shipping.');
    if (!pin) throw new Error('Order address has no valid 6-digit PIN code, which Shiprocket requires.');

    const looked = await lookupPin(pin);
    const guess = guessStateCity(full);
    const city = looked?.city || guess.city;
    const state = looked?.state || guess.state;
    if (!city || !state) throw new Error(`Could not work out city/state for PIN ${pin}. Add the city and state to the order address and try again.`);

    const phone = indianMobile(order.user.phone);
    if (phone.length !== 10) throw new Error(`Customer phone "${order.user.phone}" is not a valid 10-digit Indian mobile number.`);

    const { first, last } = splitName(order.user.name);
    const istDate = new Date(order.createdAt.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
    const weight = Math.max(0.1, env.SHIPROCKET_DEFAULT_WEIGHT_KG * Math.max(1, order.items.reduce((n, i) => n + i.quantity, 0)));

    const created: any = await createShipment({
      order_id: order.orderNumber,
      order_date: istDate,
      pickup_location: await getPickupLocation(),
      billing_customer_name: first,
      billing_last_name: last,
      billing_address: full.slice(0, 190),
      billing_city: city,
      billing_pincode: pin,
      billing_state: state,
      billing_country: 'India',
      billing_email: order.user.email || env.SHIPROCKET_FALLBACK_EMAIL,
      billing_phone: phone,
      shipping_is_billing: true,
      order_items: order.items.map((i) => ({ name: i.product.name, sku: i.product.slug, units: i.quantity, selling_price: i.unitPrice })),
      payment_method: 'Prepaid',
      shipping_charges: order.shippingFee,
      sub_total: order.subtotal,
      length: 10, breadth: 10, height: 10, weight,
    });

    shiprocketOrderId = created?.order_id != null ? String(created.order_id) : null;
    shipmentId = created?.shipment_id != null ? String(created.shipment_id) : null;
    if (!shiprocketOrderId || !shipmentId) throw new Error(`Shiprocket did not return an order/shipment id: ${JSON.stringify(created).slice(0, 300)}`);
    awb = created?.awb_code ? String(created.awb_code) : '';
    courier = created?.courier_name ? String(created.courier_name) : '';
    await db.order.update({ where: { id: order.id }, data: { shiprocketOrderId, shiprocketShipmentId: shipmentId, status: 'PROCESSING' } });
  }

  if (!awb) {
    try {
      const assigned = await assignAwb(shipmentId);
      awb = assigned.awb; courier = assigned.courier;
    } catch (e: any) {
      // The Shiprocket order exists now; pressing "Create shipment" again only retries the courier step.
      throw new Error(`Shiprocket order ${shiprocketOrderId} ban gaya, lekin courier/AWB assign nahi hua: ${e.message}. Shiprocket wallet balance aur pincode serviceability check karke dobara "Create shipment" dabayein.`);
    }
  }

  const updated = await db.order.update({
    where: { id: order.id },
    data: { status: 'SHIPPED', awb, courier: courier || null, trackingUrl: `https://shiprocket.co/tracking/${awb}` },
  });

  await sendWhatsAppText(
    order.user.phone,
    `Aapka order ${order.orderNumber} ship ho gaya hai.${courier ? `\nCourier: ${courier}` : ''}\nAWB: ${awb}\nTracking: https://shiprocket.co/tracking/${awb}`,
  ).catch((e) => console.error('[SHIP] WhatsApp notice failed:', e?.message || e));

  return updated;
}


import { Router } from 'express';
import { db } from '../db';
import { createPayment, verifyCheckoutSignature } from '../integrations/razorpay';
import { trackShipment } from '../integrations/shiprocket';
import { auth } from '../middleware/auth';
import { markOrderPaid, shipOrder } from '../services/fulfillment';
import { makeInvoice } from '../services/receipt';
import { env } from '../config';
import { shippingFor } from '../services/pricing';

const r = Router();

r.post('/', async (req, res) => {
  try {
    const { phone, name, email, address, items } = req.body || {};

    if (!phone || !address || !Array.isArray(items) || !items.length) {
      return res.status(400).json({
        error: 'phone, address and items are required',
      });
    }

    const clean = items.map((i: any) => ({
      productId: String(i.productId),
      quantity: Math.max(1, Math.floor(Number(i.quantity))),
    }));

    const products = await db.product.findMany({
      where: {
        id: { in: clean.map((i: { productId: string }) => i.productId) },
        active: true,
      },
    });

    if (products.length !== new Set(clean.map((i: { productId: string }) => i.productId)).size) {
      return res.status(400).json({
        error: 'One or more products are unavailable',
      });
    }

    const rows = clean.map((i: { productId: string; quantity: number }) => {
      const p = products.find(
        (x: { id: string; name: string; stock: number; price: number }) =>
          x.id === i.productId
      );

      if (!p) {
        throw new Error('Product not found');
      }

      if (p.stock < i.quantity) {
        throw new Error(`${p.name} has only ${p.stock} left`);
      }

      return {
        productId: p.id,
        quantity: i.quantity,
        unitPrice: p.price,
      };
    });

    const subtotal = rows.reduce(
      (s: number, x: { quantity: number; unitPrice: number }) =>
        s + x.quantity * x.unitPrice,
      0
    );

    const shippingFee = shippingFor(subtotal);
    const total = subtotal + shippingFee;

    const user = await db.user.upsert({
      where: { phone },
      update: { name, email, address },
      create: { phone, name, email, address },
    });

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const order = await db.order.create({
      data: {
        orderNumber,
        userId: user.id,
        subtotal,
        shippingFee,
        total,
        address,
        items: { create: rows },
      },
    });

    const payment = await createPayment(total, orderNumber);

    await db.order.update({
      where: { id: order.id },
      data: { razorpayOrderId: String((payment as any).id) },
    });

    res.status(201).json({
      order: await db.order.findUnique({
        where: { id: order.id },
        include: { items: { include: { product: true } } },
      }),
      payment,
      keyId: process.env.RAZORPAY_KEY_ID || null,
    });
  } catch (e: any) {
    res.status(400).json({
      error: e.message || 'Order creation failed',
    });
  }
});

r.post('/:id/verify', async (req, res) => {
  const { razorpayPaymentId, razorpaySignature } = req.body || {};

  const order = await db.order.findUnique({
    where: { id: String(req.params.id) },
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (
    !verifyCheckoutSignature(
      String(order.razorpayOrderId),
      String(razorpayPaymentId),
      String(razorpaySignature)
    )
  ) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  res.json(await markOrderPaid(order.id, String(razorpayPaymentId)));
});

r.post('/:id/mock-pay', async (req, res) => {
  if (!env.MOCK_PROVIDERS) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const order = await markOrderPaid(
      String(req.params.id),
      `mock_pay_${Date.now()}`
    );

    res.json(order);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

r.get('/', auth, async (_req, res) => {
  res.json(
    await db.order.findMany({
      include: {
        user: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  );
});

r.get('/:id/invoice', async (req, res) => {
  const o = await db.order.findUnique({
    where: { id: String(req.params.id) },
    include: {
      user: true,
      items: { include: { product: true } },
    },
  });

  if (!o) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (o.paymentStatus !== 'PAID') {
    return res.status(400).json({
      error: 'Invoice is available after payment',
    });
  }

  const pdf = await makeInvoice({
    orderNumber: o.orderNumber,
    name: o.user.name,
    phone: o.user.phone,
    items: o.items.map(
      (i: { product: { name: string }; quantity: number; unitPrice: number }) => ({
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })
    ),
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    total: o.total,
    paymentStatus: o.paymentStatus,
    paymentId: o.razorpayPaymentId,
    paidAt: o.paidAt,
    address: (o.address as any)?.full ? String((o.address as any).full) : null,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${o.orderNumber}.pdf"`
  );
  res.send(pdf);
});

// Public tracking lookup: returns order status only. Customer phone/address are never exposed here.
r.get('/:number', async (req, res) => {
  const o = await db.order.findUnique({
    where: { orderNumber: String(req.params.number) },
    include: { items: { include: { product: { select: { name: true } } } } },
  });

  if (!o) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json({
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    subtotal: o.subtotal,
    shippingFee: o.shippingFee,
    total: o.total,
    currency: o.currency,
    courier: o.courier,
    awb: o.awb,
    trackingUrl: o.trackingUrl,
    createdAt: o.createdAt,
    items: o.items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, product: { name: i.product.name } })),
  });
});

r.post('/:id/ship', auth, async (req, res) => {
  try {
    res.json(await shipOrder(String(req.params.id)));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

r.get('/:id/tracking', async (req, res) => {
  const o = await db.order.findUnique({
    where: { id: String(req.params.id) },
  });

  if (!o) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (!o.awb) {
    return res.json({ localStatus: o.status, tracking: null });
  }

  res.json({
    localStatus: o.status,
    tracking: await trackShipment(o.awb),
  });
});

export default r;
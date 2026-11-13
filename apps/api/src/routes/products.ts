import { Router } from 'express';
import { db } from '../db';
import { isSellable, getFreeShippingAbove } from '../services/pricing';

// Public catalogue (read-only). Creating/editing products happens only in the authenticated admin API (/api/admin/products).
const r = Router();

r.get('/', async (_req, res) => {
  const rows = await db.product.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } });
  res.json(rows.filter(isSellable).map((p) => ({ ...p, description: /^add product description$/i.test(p.description.trim()) ? '' : p.description })));
});

// Public: the store-wide free-delivery amount (0 = no offer), so the website cart can show the same delivery charge the server will bill.
r.get('/shipping', async (_req, res) => res.json({ freeAbove: await getFreeShippingAbove() }));

export default r;

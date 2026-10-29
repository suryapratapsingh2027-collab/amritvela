import { Router } from 'express';
import { db } from '../db';
import { isSellable } from '../services/pricing';

// Public catalogue (read-only). Creating/editing products happens only in the authenticated admin API (/api/admin/products).
const r = Router();

r.get('/', async (_req, res) => {
  const rows = await db.product.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } });
  res.json(rows.filter(isSellable).map((p) => ({ ...p, description: /^add product description$/i.test(p.description.trim()) ? '' : p.description })));
});

export default r;

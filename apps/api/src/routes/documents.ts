import { Router } from 'express';
import { db } from '../db';

// Public, read-only access to the PDFs the admin marked active (the WhatsApp bot sends the same files).
const r = Router();

r.get('/', async (_req, res) => {
  const rows = await db.document.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], select: { id: true, title: true, description: true, size: true, createdAt: true } });
  res.json(rows);
});

r.get('/:id/file', async (req, res) => {
  const doc = await db.document.findFirst({ where: { id: String(req.params.id), active: true } });
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  await db.document.update({ where: { id: doc.id }, data: { downloads: { increment: 1 } } }).catch(() => undefined);
  const safeName = doc.fileName.replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(Buffer.from(doc.data));
});

export default r;

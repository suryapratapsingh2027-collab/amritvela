import { Router } from 'express';
import { db } from '../db';
const r = Router();
r.get('/gallery', async (_req, res) => res.json(await db.galleryImage.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] })));
r.get('/posters', async (_req, res) => res.json(await db.eventPoster.findMany({ where: { active: true }, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }] })));
export default r;

import { Router } from 'express';
import { db } from '../db';
import { campaignStats, listCampaignViews, toView, type CampaignRow } from '../services/campaigns';

// Public, read-only campaign data for the website (progress bars). Only campaigns the admin made visible.
const r = Router();

const publicShape = (c: ReturnType<typeof toView>) => ({
  slug: c.slug, title: c.title, status: c.effectiveStatus, imageUrl: c.imageUrl,
  description: { en: c.descriptionEn, hi: c.descriptionHi, hing: c.descriptionHing, pa: c.descriptionPa },
  targetAmount: c.targetAmount, raised: c.raised, percent: c.percent, donors: c.donors, goalReached: c.goalReached, daysLeft: c.daysLeft, endsAt: c.endsAt, acceptingDonations: c.effectiveStatus === 'ACTIVE',
});

r.get('/', async (_req, res) => {
  const views = await listCampaignViews({ status: { in: ['ACTIVE', 'COMPLETED'] } });
  const visible = views.filter((c) => c.effectiveStatus === 'ACTIVE' || c.effectiveStatus === 'COMPLETED');
  visible.sort((a, b) => Number(b.effectiveStatus === 'ACTIVE') - Number(a.effectiveStatus === 'ACTIVE'));
  res.json(visible.map(publicShape));
});

r.get('/:slug', async (req, res) => {
  const row = (await db.campaign.findUnique({ where: { slug: String(req.params.slug) } })) as CampaignRow | null;
  if (!row || row.status === 'PAUSED') return res.status(404).json({ error: 'Campaign not found' });
  const stats = (await campaignStats([row.id])).get(row.id)!;
  res.json(publicShape(toView(row, stats)));
});

export default r;

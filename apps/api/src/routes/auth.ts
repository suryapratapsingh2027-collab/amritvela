import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db';
import { env } from '../config';
import { signAdmin } from '../utils/auth';
import { auth } from '../middleware/auth';
import { rateLimit } from '../utils/rate-limit';
import { emailConfigured, sendEmail } from '../services/email';

const r = Router();

const email = z.string().trim().toLowerCase().email('Valid email address required').max(120);
export const passwordRule = z.string().min(10, 'Password kam se kam 10 characters ka hona chahiye').max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password me kam se kam ek letter aur ek number hona chahiye');

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const firstError = (e: z.ZodError) => {
  const i = e.issues[0];
  if (!i) return 'Invalid input';
  return i.code === 'invalid_type' ? 'Kuch field galat ya khali hai. Dobara check karein.' : i.message;
};
const findAdminByEmail = (value: string) => db.adminUser.findFirst({ where: { email: { equals: value, mode: 'insensitive' } } });
const publicUser = (u: { id: string; email: string; role: string }) => ({ id: u.id, email: u.email, role: u.role });

r.get('/config', (_, res) => res.json({ mockProviders: env.MOCK_PROVIDERS, emailConfigured: emailConfigured() }));

r.post('/login',
  rateLimit({ windowMs: 15 * 60_000, max: 10, key: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`, message: 'Bahut zyada login koshishein. 15 minute baad dobara try karein.' }),
  async (req, res) => {
    const { email: rawEmail, password } = req.body || {};
    const u = typeof rawEmail === 'string' ? await findAdminByEmail(rawEmail.trim()) : null;
    // Always run bcrypt so response time does not reveal whether the email exists.
    const ok = await bcrypt.compare(String(password || ''), u?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
    if (!u || !ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: signAdmin(u.id, u.tokenVersion), user: publicUser(u) });
  });

r.post('/forgot-password',
  rateLimit({ windowMs: 60 * 60_000, max: 5, message: 'Bahut zyada requests. Ek ghante baad try karein.' }),
  async (req, res) => {
    const generic = { ok: true, message: 'Agar yeh email admin account se juda hai, to password reset link bhej diya gaya hai. Link 30 minute tak valid hai.' };
    const parsed = email.safeParse(req.body?.email);
    if (!parsed.success) return res.status(400).json({ error: 'Valid email address likhein.' });
    try {
      const admin = await findAdminByEmail(parsed.data);
      if (admin) {
        const token = crypto.randomBytes(32).toString('hex');
        await db.passwordReset.deleteMany({ where: { adminId: admin.id, usedAt: null } });
        await db.passwordReset.create({ data: { adminId: admin.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
        const link = `${env.WEB_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
        const sent = await sendEmail(admin.email, 'Amrit Vela Trust — admin password reset',
          `Namaste,\n\nAdmin password reset karne ke liye yeh link kholein (30 minute tak valid):\n${link}\n\nAgar aapne request nahi ki, to is email ko ignore karein.`,
          `<p>Namaste,</p><p>Admin password reset karne ke liye neeche button dabayein (30 minute tak valid).</p><p><a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Password reset karein</a></p><p style="color:#666;font-size:12px">Agar aapne request nahi ki, to is email ko ignore karein.</p>`);
        if (!sent) console.warn(`[AUTH] SMTP not configured/failed. Password reset link for ${admin.email}: ${link}`);
      }
    } catch (e: any) {
      console.error('[AUTH] forgot-password failed:', e?.message || e);
    }
    res.json(generic); // identical response whether or not the account exists
  });

r.post('/reset-password',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  async (req, res) => {
    const parsed = z.object({ token: z.string().min(20).max(200), password: passwordRule }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
    const record = await db.passwordReset.findUnique({ where: { tokenHash: sha256(parsed.data.token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) return res.status(400).json({ error: 'Yeh reset link invalid ya expire ho chuka hai. Naya link mangwayein.' });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await db.$transaction([
      db.adminUser.update({ where: { id: record.adminId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
      db.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.passwordReset.deleteMany({ where: { adminId: record.adminId, usedAt: null } }),
    ]);
    res.json({ ok: true, message: 'Password badal diya gaya hai. Ab naye password se sign in karein.' });
  });

r.get('/me', auth, (req, res) => res.json(publicUser((req as any).admin)));

r.post('/change-password', auth, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const admin = (req as any).admin;
  const parsed = z.object({ currentPassword: z.string().min(1, 'Current password likhein'), newPassword: passwordRule }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  if (!(await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash))) return res.status(400).json({ error: 'Current password galat hai.' });
  if (parsed.data.currentPassword === parsed.data.newPassword) return res.status(400).json({ error: 'Naya password purane se alag hona chahiye.' });
  const updated = await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), tokenVersion: { increment: 1 } } });
  // Other sessions are now invalid; hand back a fresh token so this browser stays signed in.
  res.json({ ok: true, message: 'Password badal diya gaya hai.', token: signAdmin(updated.id, updated.tokenVersion), user: publicUser(updated) });
});

r.post('/change-email', auth, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const admin = (req as any).admin;
  const parsed = z.object({ currentPassword: z.string().min(1, 'Current password likhein'), newEmail: email }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  if (!(await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash))) return res.status(400).json({ error: 'Current password galat hai.' });
  const clash = await findAdminByEmail(parsed.data.newEmail);
  if (clash && clash.id !== admin.id) return res.status(409).json({ error: 'Yeh email kisi aur admin account me use ho rahi hai.' });
  const updated = await db.adminUser.update({ where: { id: admin.id }, data: { email: parsed.data.newEmail } });
  res.json({ ok: true, message: 'Email badal diya gaya hai. Ab isi email se sign in karein.', user: publicUser(updated) });
});

export default r;

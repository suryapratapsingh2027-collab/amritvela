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
export const passwordRule = z.string().min(10, 'The password must be at least 10 characters.').max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'The password must contain at least one letter and one number.');

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const firstError = (e: z.ZodError) => {
  const i = e.issues[0];
  if (!i) return 'Invalid input';
  return i.code === 'invalid_type' ? 'Some fields are missing or invalid. Please check and try again.' : i.message;
};
const findAdminByEmail = (value: string) => db.adminUser.findFirst({ where: { email: { equals: value, mode: 'insensitive' } } });
type AdminRow = { id: string; email: string; role: string; name?: string | null; phone?: string | null; avatarUrl?: string | null; lastLoginAt?: Date | null; createdAt?: Date };
const publicUser = (u: AdminRow) => ({ id: u.id, email: u.email, role: u.role, name: u.name ?? null, phone: u.phone ?? null, avatarUrl: u.avatarUrl ?? null, lastLoginAt: u.lastLoginAt ?? null, createdAt: u.createdAt ?? null });

r.get('/config', (_, res) => res.json({ mockProviders: env.MOCK_PROVIDERS, emailConfigured: emailConfigured() }));

r.post('/login',
  rateLimit({ windowMs: 15 * 60_000, max: 10, key: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`, message: 'Too many login attempts. Please try again in 15 minutes.' }),
  async (req, res) => {
    const { email: rawEmail, password } = req.body || {};
    const u = typeof rawEmail === 'string' ? await findAdminByEmail(rawEmail.trim()) : null;
    // Always run bcrypt so response time does not reveal whether the email exists.
    const ok = await bcrypt.compare(String(password || ''), u?.passwordHash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
    if (!u || !ok) return res.status(401).json({ error: 'Invalid credentials' });
    const seen = await db.adminUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    res.json({ token: signAdmin(u.id, u.tokenVersion), user: publicUser({ ...u, lastLoginAt: seen.lastLoginAt }) });
  });

r.post('/forgot-password',
  rateLimit({ windowMs: 60 * 60_000, max: 5, message: 'Too many requests. Please try again in an hour.' }),
  async (req, res) => {
    const generic = { ok: true, message: 'If this email belongs to an admin account, a password reset link has been sent. The link is valid for 30 minutes.' };
    const parsed = email.safeParse(req.body?.email);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address.' });
    try {
      const admin = await findAdminByEmail(parsed.data);
      if (admin) {
        const token = crypto.randomBytes(32).toString('hex');
        await db.passwordReset.deleteMany({ where: { adminId: admin.id, usedAt: null } });
        await db.passwordReset.create({ data: { adminId: admin.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
        const link = `${env.WEB_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
        const sent = await sendEmail(admin.email, 'Amrit Vela Trust: admin password reset',
          `Hello,\n\nOpen this link to reset your admin password (valid for 30 minutes):\n${link}\n\nIf you did not request this, please ignore this email.`,
          `<p>Hello,</p><p>Click the button below to reset your admin password (valid for 30 minutes).</p><p><a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Reset password</a></p><p style="color:#666;font-size:12px">If you did not request this, please ignore this email.</p>`);
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
    if (!record || record.usedAt || record.expiresAt < new Date()) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await db.$transaction([
      db.adminUser.update({ where: { id: record.adminId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
      db.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.passwordReset.deleteMany({ where: { adminId: record.adminId, usedAt: null } }),
    ]);
    res.json({ ok: true, message: 'Your password has been changed. You can now sign in with the new password.' });
  });

r.get('/me', auth, (req, res) => res.json(publicUser((req as any).admin)));

const profileInput = z.object({
  name: z.string().trim().min(2, 'Enter your full name (at least 2 characters).').max(60, 'Keep the name within 60 characters.').nullable().optional(),
  phone: z.string().trim().transform((v) => v.replace(/[\s-]/g, '')).refine((v) => v === '' || /^\+?\d{10,13}$/.test(v), 'Enter a valid mobile number (10 digits).').nullable().optional(),
  avatarUrl: z.string().trim().max(2000).refine((v) => v === '' || /^https:\/\//i.test(v), 'The photo link must start with https://').nullable().optional(),
});
r.patch('/me', auth, async (req, res) => {
  const parsed = profileInput.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  const d = parsed.data; const blank = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v === '' ? null : v);
  const u = await db.adminUser.update({ where: { id: (req as any).admin.id }, data: { name: blank(d.name), phone: blank(d.phone), avatarUrl: blank(d.avatarUrl) } });
  res.json(publicUser(u));
});

r.post('/change-password', auth, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const admin = (req as any).admin;
  const parsed = z.object({ currentPassword: z.string().min(1, 'Enter your current password.'), newPassword: passwordRule }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  if (!(await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash))) return res.status(400).json({ error: 'The current password is incorrect.' });
  if (parsed.data.currentPassword === parsed.data.newPassword) return res.status(400).json({ error: 'The new password must be different from the old one.' });
  const updated = await db.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), tokenVersion: { increment: 1 } } });
  // Other sessions are now invalid; hand back a fresh token so this browser stays signed in.
  res.json({ ok: true, message: 'Your password has been changed.', token: signAdmin(updated.id, updated.tokenVersion), user: publicUser(updated) });
});

r.post('/change-email', auth, rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  const admin = (req as any).admin;
  const parsed = z.object({ currentPassword: z.string().min(1, 'Enter your current password.'), newEmail: email }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstError(parsed.error) });
  if (!(await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash))) return res.status(400).json({ error: 'The current password is incorrect.' });
  const clash = await findAdminByEmail(parsed.data.newEmail);
  if (clash && clash.id !== admin.id) return res.status(409).json({ error: 'This email is already used by another admin account.' });
  const updated = await db.adminUser.update({ where: { id: admin.id }, data: { email: parsed.data.newEmail } });
  res.json({ ok: true, message: 'Your email has been changed. Please sign in with the new email from now on.', user: publicUser(updated) });
});

export default r;

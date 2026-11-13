import crypto from 'crypto';
import { env } from '../config';

/**
 * Encrypts secrets stored in the database (a trust's own Razorpay key secret / webhook secret) with AES-256-GCM.
 * The key comes from SECRETS_KEY (recommended) or is derived from JWT_SECRET, so a database dump alone never exposes them.
 */
const keyBytes = () => crypto.createHash('sha256').update(`avt-secret-box:${process.env.SECRETS_KEY || env.JWT_SECRET}`).digest();

export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const [v, iv, tag, data] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || !data) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch { return null; } // wrong key (JWT_SECRET/SECRETS_KEY changed) or tampered value
}

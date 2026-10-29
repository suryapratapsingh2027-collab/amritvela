import nodemailer from 'nodemailer';
import { env } from '../config';

export function emailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

/** Sends an email. Returns false (and logs why) instead of throwing, so callers never leak provider errors to users. */
export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
    await transport.sendMail({ from: env.SMTP_FROM || `Amrit Vela Trust <${env.SMTP_USER}>`, to, subject, text, html });
    return true;
  } catch (e: any) {
    console.error('[EMAIL] send failed:', e?.message || e);
    return false;
  }
}

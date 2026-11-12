/**
 * Live Kirtan alerts.
 * When the Trust's YouTube Live kirtan starts (on a schedule the admin controls, or when the admin presses "Go live now"),
 * every customer who has chatted with the WhatsApp bot (and has not replied STOP) receives the live link in their language.
 *
 * WhatsApp rules this module respects:
 *  - Free-form messages are allowed only within 24 hours of the customer's last message.
 *  - Everyone else can only be reached with a Meta-approved template (WHATSAPP_LIVE_TEMPLATE_NAME). Without one they are
 *    counted as "skipped" (and the admin sees how many) instead of failing silently.
 *  - Customers can opt out with STOP (User.liveAlerts).
 */
import { db } from '../db';
import { env } from '../config';
import { sendWhatsAppTemplate, sendWhatsAppText, whatsappErrorInfo, whatsappLive } from '../integrations/whatsapp';
import { normalizeLang, t, type Lang } from '../i18n';
import { addDays, isHm, isYmd, istParts } from './time';

const DAY = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ settings */

const KEY = { url: 'live.url', title: 'live.title', enabled: 'live.enabled', windowHours: 'live.windowHours', liveUntil: 'live.liveUntil' } as const;

export type LiveSettings = { url: string; title: string; enabled: boolean; windowHours: number; liveUntil: string | null; isLiveNow: boolean };

export function validateYoutubeUrl(value: string): string | null {
  let u: URL;
  try { u = new URL(value); } catch { return 'Enter a full YouTube link starting with https://'; }
  if (u.protocol !== 'https:') return 'The YouTube link must start with https://';
  if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) return `This does not look like a YouTube link (${u.hostname}).`;
  return null;
}

export async function getLiveSettings(now = new Date()): Promise<LiveSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: Object.values(KEY) } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const liveUntil = get(KEY.liveUntil) || null;
  return {
    url: get(KEY.url) || '', title: get(KEY.title) || 'Live Kirtan', enabled: get(KEY.enabled) !== 'false',
    windowHours: Math.min(12, Math.max(1, Number(get(KEY.windowHours)) || 3)), liveUntil,
    isLiveNow: Boolean(liveUntil && new Date(liveUntil).getTime() > now.getTime()),
  };
}

export async function saveLiveSettings(input: Partial<{ url: string; title: string; enabled: boolean; windowHours: number }>) {
  const put = (key: string, value: string) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  if (input.url !== undefined) { if (input.url) await put(KEY.url, input.url); else await db.setting.deleteMany({ where: { key: KEY.url } }); }
  if (input.title !== undefined) await put(KEY.title, input.title || 'Live Kirtan');
  if (input.enabled !== undefined) await put(KEY.enabled, String(input.enabled));
  if (input.windowHours !== undefined) await put(KEY.windowHours, String(input.windowHours));
}

export const setLiveNow = (hours: number, now = new Date()) =>
  db.setting.upsert({ where: { key: KEY.liveUntil }, update: { value: new Date(now.getTime() + hours * 3_600_000).toISOString() }, create: { key: KEY.liveUntil, value: new Date(now.getTime() + hours * 3_600_000).toISOString() } });
export const clearLiveNow = () => db.setting.deleteMany({ where: { key: KEY.liveUntil } });

/* ------------------------------------------------------------------ schedules */

export type Slot = { id: string; label: string; time: string; days: string; onceDate: string | null; active: boolean; lastFiredKey: string | null };
const parseDays = (days: string) => days.split(',').map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

export function validateSlot(input: { label?: string; time?: string; days?: number[]; onceDate?: string | null }): string | null {
  if (!input.label || input.label.trim().length < 2) return 'Enter a name for this slot (for example “Morning Kirtan”).';
  if (input.label.trim().length > 40) return 'Keep the slot name within 40 characters.';
  if (!input.time || !isHm(input.time)) return 'Enter the time as HH:MM in 24-hour format (India time), for example 09:00.';
  if (input.onceDate) { if (!isYmd(input.onceDate)) return 'Enter the date as YYYY-MM-DD.'; }
  else if (!input.days || !input.days.length || input.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Choose at least one day of the week, or a specific date.';
  return null;
}

/** Is the slot due at `now`? It fires inside the slot's minute and up to 15 minutes after (catch-up if the server was asleep). */
export function slotIsDue(slot: Slot, now = new Date()): boolean {
  if (!slot.active) return false;
  const t0 = istParts(now);
  const matchesDay = slot.onceDate ? slot.onceDate === t0.ymd : parseDays(slot.days).includes(t0.dow);
  if (!matchesDay) return false;
  const [h, m] = slot.time.split(':').map(Number);
  const [nh, nm] = t0.hm.split(':').map(Number);
  const diff = nh * 60 + nm - (h * 60 + m);
  return diff >= 0 && diff < 15;
}
export const slotKey = (slot: Slot, now = new Date()) => `${istParts(now).ymd} ${slot.time}`;

/** Next time the slot will fire (India time), or null for a one-off slot in the past. */
export function nextFire(slot: Slot, now = new Date()): { ymd: string; time: string } | null {
  const t0 = istParts(now);
  for (let i = 0; i < 8; i++) {
    const ymd = addDays(t0.ymd, i);
    const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
    const ok = slot.onceDate ? slot.onceDate === ymd : parseDays(slot.days).includes(dow);
    if (ok && (i > 0 || slot.time > t0.hm)) return { ymd, time: slot.time };
  }
  return null;
}

function formatTime12(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "Daily 9:00 AM", "Mon, Wed 12:00 PM", "On 2026-11-12 11:30 PM" in the customer's language. */
export function describeSlot(slot: Slot, lang: Lang | null): string {
  const time = formatTime12(slot.time);
  if (slot.onceDate) return `${t(lang, 'slot_once', { date: slot.onceDate })} ${time}`;
  const days = parseDays(slot.days);
  if (days.length === 7) return `${t(lang, 'slot_daily')} ${time}`;
  const names = t(lang, 'days_short').split(',');
  return `${days.map((d) => names[d]).join(', ')} ${time}`;
}

/* ------------------------------------------------------------------ audience */

export type Recipient = { id: string; phone: string; lang: Lang | null; withinWindow: boolean };

/** Customers who chatted with the bot on WhatsApp and have not opted out. */
export async function liveAudience(now = new Date()): Promise<Recipient[]> {
  const rows = await db.$queryRaw<{ id: string; phone: string; language: string | null; last_in: Date | null }[]>`
    SELECT u.id, u."phone", u."language", MAX(m."createdAt") AS last_in
    FROM "User" u
    JOIN "Conversation" c ON c."userId" = u.id AND c."channel" = 'WHATSAPP'
    LEFT JOIN "Message" m ON m."conversationId" = c.id AND m."direction" = 'IN'
    WHERE u."liveAlerts" = true AND u."phone" ~ '^[0-9]{10,15}$'
    GROUP BY u.id`;
  const cutoff = now.getTime() - DAY;
  return rows.map((r) => ({ id: r.id, phone: r.phone, lang: normalizeLang(r.language), withinWindow: Boolean(r.last_in && new Date(r.last_in).getTime() >= cutoff) }));
}

export const templateConfigured = () => Boolean(env.WHATSAPP_LIVE_TEMPLATE_NAME);

export async function audienceSummary(now = new Date()) {
  const all = await liveAudience(now);
  const optedOut = await db.user.count({ where: { liveAlerts: false, conversations: { some: { channel: 'WHATSAPP' } } } });
  const within = all.filter((r) => r.withinWindow).length;
  return { subscribers: all.length, withinWindow: within, outsideWindow: all.length - within, optedOut, templateConfigured: templateConfigured(), reachable: templateConfigured() ? all.length : within, whatsappLive: whatsappLive() };
}

/* ------------------------------------------------------------------ sending */

type SendResult = 'sent' | 'skipped' | 'failed';

async function sendOne(r: Recipient, title: string, url: string): Promise<{ result: SendResult; error?: string }> {
  const viaTemplate = async () => {
    await sendWhatsAppTemplate(r.phone, env.WHATSAPP_LIVE_TEMPLATE_NAME!, env.WHATSAPP_LIVE_TEMPLATE_LANG, [title, url]);
    return { result: 'sent' as SendResult };
  };
  try {
    if (r.withinWindow) {
      try {
        await sendWhatsAppText(r.phone, t(r.lang, 'live_alert', { title, url }));
        return { result: 'sent' };
      } catch (e: any) {
        // The 24-hour window may have just closed: fall back to the template when there is one.
        if (whatsappErrorInfo(e).windowClosed && templateConfigured()) return await viaTemplate();
        throw e;
      }
    }
    if (templateConfigured()) return await viaTemplate();
    return { result: 'skipped' };
  } catch (e: any) {
    const info = whatsappErrorInfo(e);
    return { result: info.windowClosed ? 'skipped' : 'failed', error: info.message };
  }
}

/** Processes one broadcast row: sends to every recipient and keeps the counters up to date. */
export async function runBroadcast(broadcastId: string, now = new Date()) {
  const b = await db.broadcast.findUnique({ where: { id: broadcastId } });
  if (!b) return;
  let sent = 0, failed = 0, skipped = 0, firstError: string | null = null;
  try {
    const audience = await liveAudience(now);
    await db.broadcast.update({ where: { id: b.id }, data: { total: audience.length } });
    let n = 0;
    for (const r of audience) {
      const out = await sendOne(r, b.title, b.url);
      if (out.result === 'sent') sent++; else if (out.result === 'skipped') skipped++; else { failed++; firstError ??= out.error ?? 'send failed'; }
      if (++n % 15 === 0) await db.broadcast.update({ where: { id: b.id }, data: { sent, failed, skipped } });
      if (env.BROADCAST_DELAY_MS) await sleep(env.BROADCAST_DELAY_MS);
    }
    await db.broadcast.update({ where: { id: b.id }, data: { status: 'DONE', sent, failed, skipped, error: firstError, finishedAt: new Date() } });
  } catch (e: any) {
    console.error('[LIVE] broadcast failed:', e?.message || e);
    await db.broadcast.update({ where: { id: b.id }, data: { status: 'FAILED', sent, failed, skipped, error: String(e?.message || e).slice(0, 300), finishedAt: new Date() } }).catch(() => undefined);
  }
}

/** Creates the broadcast row, marks "live now" for the bot, and sends in the background. */
export async function startBroadcast(opts: { trigger: 'MANUAL' | 'SCHEDULE'; title: string; url: string; scheduleId?: string | null; now?: Date; wait?: boolean }) {
  const now = opts.now ?? new Date();
  const settings = await getLiveSettings(now);
  await setLiveNow(settings.windowHours, now);
  const b = await db.broadcast.create({ data: { trigger: opts.trigger, title: opts.title, url: opts.url, scheduleId: opts.scheduleId ?? null } });
  const job = runBroadcast(b.id, now);
  if (opts.wait) await job; else void job;
  return b;
}

/** One-person preview so the admin can see exactly what customers will receive. */
export async function sendLiveTest(phone: string, title: string, url: string, lang: Lang | null) {
  const out = await sendOne({ id: 'test', phone, lang, withinWindow: true }, title, url);
  await db.broadcast.create({ data: { trigger: 'TEST', title, url, status: out.result === 'failed' ? 'FAILED' : 'DONE', total: 1, sent: out.result === 'sent' ? 1 : 0, failed: out.result === 'failed' ? 1 : 0, skipped: out.result === 'skipped' ? 1 : 0, error: out.error ?? null, finishedAt: new Date() } });
  return out;
}

/* ------------------------------------------------------------------ scheduler */

/** Fires every slot that is due now. Safe to call every 30 seconds and from several instances (a slot fires once per day). */
export async function runDueSchedules(now = new Date(), wait = false): Promise<number> {
  const settings = await getLiveSettings(now);
  if (!settings.enabled || !settings.url) return 0;
  const slots = (await db.liveSchedule.findMany({ where: { active: true } })) as Slot[];
  let fired = 0;
  for (const slot of slots) {
    if (!slotIsDue(slot, now)) continue;
    const key = slotKey(slot, now);
    const claim = await db.liveSchedule.updateMany({ where: { id: slot.id, OR: [{ lastFiredKey: null }, { lastFiredKey: { not: key } }] }, data: { lastFiredKey: key } });
    if (claim.count === 0) continue;
    await startBroadcast({ trigger: 'SCHEDULE', title: slot.label || settings.title, url: settings.url, scheduleId: slot.id, now, wait });
    fired++;
  }
  return fired;
}

export function startLiveScheduler() {
  if (env.MOCK_PROVIDERS) { console.warn('[LIVE] scheduler not started in mock mode'); return; }
  setInterval(() => void runDueSchedules().catch((e) => console.error('[LIVE] scheduler error:', e?.message || e)), 30_000).unref();
  console.log('[LIVE] kirtan alert scheduler running (checks every 30 s, India time)');
}

/** For the bot's "Live Kirtan" menu row. */
export async function liveStatusForBot(lang: Lang | null, now = new Date()) {
  const s = await getLiveSettings(now);
  const slots = ((await db.liveSchedule.findMany({ where: { active: true }, orderBy: { time: 'asc' } })) as Slot[]).filter((x) => x.onceDate ? x.onceDate >= istParts(now).ymd : true);
  return { ...s, timings: slots.map((x) => `• ${x.label} — ${describeSlot(x, lang)}`).join('\n') };
}

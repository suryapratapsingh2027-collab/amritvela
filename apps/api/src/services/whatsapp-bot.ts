/**
 * Deterministic WhatsApp assistant for Amrit Vela Trust.
 *
 * Everything that touches money or records (donations, receipts, product orders, order status) is handled here
 * with explicit rules and live database / Razorpay data. Nothing in this file calls an LLM, so it cannot
 * invent prices, stock, payment states or confirmations. Only free-form Trust questions fall through to the
 * AI (see routes/webhooks.ts), and that path is grounded + guarded in services/ai.ts.
 *
 * Multi-step flows (cart, checkout, donation) keep their state in Conversation.state (JSON) instead of guessing it
 * from the text of earlier messages, which is what caused wrong-product orders before.
 */
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { env } from '../config';
import { sendWhatsAppPdf, sendWhatsAppText, toWhatsAppImageUrl, type InteractiveSpec } from '../integrations/whatsapp';
import { createOrderPaymentLink } from '../integrations/razorpay';
import { createDonationLink } from './donation-payment-link';
import { randomInt } from 'crypto';
import { reconcileDonation, reconcileOrder, sendReceiptPdf } from './payments';
import { sendOrderInvoice } from './fulfillment';
import { getSocialLinks } from './settings';
import { activeCampaignViews, descriptionFor, isAcceptingDonations, campaignStats, toView } from './campaigns';
import { getLiveSettings, liveStatusForBot } from './live';
import { isSellable, money, shippingFor, getFreeShippingAbove } from './pricing';
import { M } from '../i18n/messages';
import { DEFAULT_LANG, LANGS, LANG_TITLES, isLang, normalizeLang, t, type Lang, type MessageKey } from '../i18n';
import {
  MAX_DONATION, hasLiveIntent, isAlertsOff, isAlertsOn, extractDonationRef, extractOrderRef, extractPin, findProducts, hasBuyIntent, hasCatalogIntent, hasDocsIntent,
  hasDonationIntent, hasHumanIntent, hasPhotoIntent, hasPriceIntent, hasSocialIntent, hasTrackIntent, isCancelOrMenu, isGreeting, isLanguageRequest, isMenuWord, isNo,
  isPaymentClaim, isReceiptRequest, isYes, normalize, parseAmount, parseCartItems, parseExplicitQuantity, validateAddress, validateName,
  type CartMention,
} from './bot-nlp';

const STATE_TTL_MS = 30 * 60 * 1000;
const MAX_CART_LINES = 10;

export type BotReply = { text: string; intent: string; image?: { url: string; caption: string }; interactive?: InteractiveSpec; after?: () => Promise<void> };
/** `replyId` is set when the customer tapped a list row / button (e.g. "menu:donate", "lang:pa", "prod:<id>", "cfm:yes"). */
export type RouteInput = { phone: string; text: string; conversationId: string; channel?: 'whatsapp' | 'web'; replyId?: string };
type Ctx = RouteInput & { lang: Lang; langChosen: boolean };

type CartItem = { productId: string; qty: number };
type State =
  | { step: 'AWAIT_PRODUCT'; at: number; items: CartItem[] }
  | { step: 'CART'; at: number; items: CartItem[] }
  | { step: 'AWAIT_NAME'; at: number; items: CartItem[]; address?: string; pin?: string }
  | { step: 'AWAIT_ADDRESS'; at: number; items: CartItem[] }
  | { step: 'AWAIT_CONFIRM'; at: number; items: CartItem[]; address: string; pin: string }
  | { step: 'AWAIT_DONATION_AMOUNT'; at: number; campaignId?: string; trustId?: string }
  | { step: 'AWAIT_DONATION_NAME'; at: number; amount: number; campaignId?: string; trustId?: string }
  | { step: 'ROOM'; at: number; stage: 'name' | 'date' | 'guests' | 'nights'; name?: string; checkIn?: string; guests?: number };

type ProductRow = { id: string; name: string; slug: string; price: number; stock: number; active: boolean; currency: string; imageUrl: string | null; deliveryCharge: number };

/** Translate in the customer's language; {support} is always available. */
const T = (c: Pick<Ctx, 'lang'>, key: MessageKey, vars: Record<string, string | number> = {}) => t(c.lang, key, { support: t(c.lang, 'support'), ...vars });

function productImage(p: ProductRow): BotReply['image'] {
  const url = toWhatsAppImageUrl(p.imageUrl);
  return url ? { url, caption: `${p.name} — ${money(p.price)}` } : undefined;
}

/* ------------------------------------------------------------------ state helpers */

async function readState(conversationId: string): Promise<State | null> {
  const c = await db.conversation.findUnique({ where: { id: conversationId }, select: { state: true } });
  const raw = c?.state as any;
  if (!raw || typeof raw !== 'object' || !('step' in raw)) return null;
  if (Date.now() - Number(raw.at || 0) > STATE_TTL_MS) { await writeState(conversationId, null); return null; }
  // Older sessions stored a single product; upgrade them to a one-line cart.
  if (!Array.isArray(raw.items) && raw.productId) raw.items = [{ productId: raw.productId, qty: Number(raw.quantity) || 1 }];
  if (['AWAIT_PRODUCT', 'CART', 'AWAIT_NAME', 'AWAIT_ADDRESS', 'AWAIT_CONFIRM'].includes(raw.step) && !Array.isArray(raw.items)) raw.items = [];
  return raw as State;
}
async function writeState(conversationId: string, state: State | null) {
  await db.conversation.update({ where: { id: conversationId }, data: { state: state ? (state as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
}

async function loadProducts(): Promise<ProductRow[]> {
  const rows = await db.product.findMany({
    where: { active: true }, orderBy: { name: 'asc' }, take: 100,
    select: { id: true, name: true, slug: true, price: true, stock: true, active: true, currency: true, imageUrl: true, deliveryCharge: true },
  });
  return rows.filter(isSellable);
}

/* ------------------------------------------------------------------ menus (interactive messages) */

const list = (c: Ctx, intent: string, spec: Omit<Extract<InteractiveSpec, { kind: 'list' }>, 'kind'>): BotReply => ({ intent, text: spec.body, interactive: { kind: 'list', ...spec } });
const buttons = (intent: string, body: string, btns: { id: string; title: string }[]): BotReply => ({ intent, text: body, interactive: { kind: 'buttons', body, buttons: btns } });

/** Social links entered by the admin (Admin > Social Links), in a fixed order. */
async function socialLines(): Promise<string[]> {
  const s = await getSocialLinks();
  const out: string[] = [];
  if (s.instagram) out.push(`📸 Instagram: ${s.instagram}`);
  if (s.facebook) out.push(`📘 Facebook: ${s.facebook}`);
  if (s.whatsappChannel) out.push(`📢 WhatsApp Channel: ${s.whatsappChannel}`);
  if (s.whatsappGroup) out.push(`💬 WhatsApp: ${s.whatsappGroup}`);
  if (s.youtube) out.push(`▶️ YouTube: ${s.youtube}`);
  return out;
}

/** Trusts the admin added besides Amrit Vela Trust (for example Nanak Roti Trust). */
const activeTrusts = () => db.trust.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
/** Trusts shown under Trust information (the catch-all General Donation entry is only for donating). */
const infoTrusts = async () => (await activeTrusts()).filter((x) => x.slug !== 'general-donation' && x.infoEn.trim().length >= 10);
const activeDocuments = () => db.document.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], select: { id: true, title: true, description: true } });

/** First message of a new conversation: welcome + language list (shown in all scripts, since the language is not known yet). */
function languageMenu(c: Ctx): BotReply {
  return list(c, 'LANGUAGE', {
    header: 'Amrit Vela Trust', body: t('en', 'lang_welcome_body'), button: t('en', 'lang_button'),
    sections: [{ title: 'Language / भाषा', rows: LANGS.map((l) => ({ id: `lang:${l}`, title: LANG_TITLES[l] })) }],
  });
}

async function mainMenu(c: Ctx, prefix?: string): Promise<BotReply> {
  const live = await getLiveSettings();
  const rows = [
    { id: 'menu:channel', title: T(c, 'm_channel'), description: T(c, 'm_channel_d') },
    { id: 'menu:donate', title: T(c, 'm_donate'), description: T(c, 'm_donate_d') },
    { id: 'menu:pm', title: T(c, 'm_pm'), description: T(c, 'm_pm_d') },
    { id: 'menu:otherprod', title: T(c, 'm_otherprod'), description: T(c, 'm_otherprod_d') },
    { id: 'menu:rooms', title: T(c, 'm_rooms'), description: T(c, 'm_rooms_d') },
    { id: 'menu:social', title: T(c, 'm_social'), description: T(c, 'm_social_d') },
    ...(live.url && live.enabled ? [{ id: 'menu:live', title: T(c, 'm_live'), description: T(c, 'm_live_d') }] : []),
    { id: 'menu:more', title: T(c, 'm_more'), description: T(c, 'm_more_d') },
  ];
  return list(c, 'MENU', { body: `${prefix ? `${prefix}\n\n` : ''}${T(c, 'menu_body')}`, button: T(c, 'menu_button'), sections: [{ title: T(c, 'sec_menu'), rows }] });
}

/** "Other information": Trust information, order status, documents, contact, human help, language. */
async function moreMenu(c: Ctx): Promise<BotReply> {
  const [trusts, docs] = await Promise.all([infoTrusts(), activeDocuments()]);
  const rows = [
    trusts.length ? { id: 'menu:info', title: T(c, 'm_trusts'), description: T(c, 'm_trusts_d') } : { id: 'menu:info', title: T(c, 'm_info'), description: T(c, 'm_info_d') },
    { id: 'menu:status', title: T(c, 'm_status') },
    ...(docs.length ? [{ id: 'menu:docs', title: T(c, 'm_docs'), description: T(c, 'm_docs_d') }] : []),
    { id: 'menu:contact', title: T(c, 'm_contact') },
    { id: 'menu:human', title: T(c, 'm_human') },
    { id: 'menu:lang', title: T(c, 'm_lang') },
  ];
  return list(c, 'MORE', { body: T(c, 'more_body'), button: T(c, 'more_button'), sections: [{ title: T(c, 'm_more'), rows }] });
}

async function channelReply(c: Ctx): Promise<BotReply> {
  const url = (await getSocialLinks()).whatsappChannel;
  if (!url) return buttons('CHANNEL', T(c, 'channel_none'), [{ id: 'menu:main', title: T(c, 'b_menu') }]);
  return buttons('CHANNEL', T(c, 'tx_channel', { url }), [{ id: 'menu:donate', title: T(c, 'b_donate') }, { id: 'menu:main', title: T(c, 'b_menu') }]);
}

async function roomsReply(c: Ctx): Promise<BotReply> {
  const info = (await db.setting.findUnique({ where: { key: 'rooms.info' } }))?.value?.trim();
  return buttons('ROOMS', info || T(c, 'room_info_default'), [{ id: 'room:start', title: T(c, 'b_room_req') }, { id: 'menu:main', title: T(c, 'b_menu') }]);
}

const TOPICS = ['about', 'kirtan', 'dharamshala', 'medical', 'achievements', 'plans'] as const;
type Topic = (typeof TOPICS)[number];

function topicsMenu(c: Ctx): BotReply {
  return list(c, 'INFO', {
    body: T(c, 'info_body'), button: T(c, 'info_button'),
    sections: [{ title: T(c, 'info_section'), rows: TOPICS.map((k) => ({ id: `info:${k}`, title: T(c, `t_${k}` as MessageKey) })) }],
  });
}

async function topicReply(c: Ctx, topic: Topic): Promise<BotReply> {
  const more = (await activeTrusts()).length ? { id: 'menu:info', title: T(c, 'b_trusts') } : { id: 'menu:info', title: T(c, 'b_more') };
  return buttons('INFO', `${T(c, `tx_${topic}` as MessageKey)}\n\n${T(c, 'after_topic')}`, [{ id: 'menu:donate', title: T(c, 'b_donate') }, more, { id: 'menu:main', title: T(c, 'b_menu') }]);
}

async function contactReply(c: Ctx): Promise<BotReply> {
  const social = await socialLines();
  return buttons('CONTACT', `${T(c, 'tx_contact')}${social.length ? `\n\n${T(c, 'tx_social')}\n${social.join('\n')}` : ''}`, [{ id: 'menu:donate', title: T(c, 'b_donate') }, { id: 'menu:info', title: T(c, 'b_more') }, { id: 'menu:main', title: T(c, 'b_menu') }]);
}

async function socialReply(c: Ctx): Promise<BotReply> {
  const social = await socialLines();
  if (!social.length) return { intent: 'SOCIAL', text: T(c, 'social_none') };
  return buttons('SOCIAL', `${T(c, 'tx_social')}\n\n${social.join('\n')}`, [{ id: 'menu:main', title: T(c, 'b_menu') }]);
}

/** "Which Trust?" list for Trust information. */
async function trustsMenu(c: Ctx, purpose: 'info' | 'donate'): Promise<BotReply> {
  if (purpose === 'donate') return donateMenu(c);
  const trusts = await infoTrusts();
  if (!trusts.length) return topicsMenu(c);
  return list(c, 'TRUSTS', {
    body: T(c, 'trusts_body'), button: T(c, 'trusts_button'),
    sections: [{ title: T(c, 'trusts_section'), rows: [
      { id: 'trust:amritvela', title: 'Amrit Vela Trust', description: T(c, 'trust_av_d') },
      ...trusts.map((x) => ({ id: `trust:${x.slug}`, title: x.name, description: T(c, 'trust_row_d') })),
    ] }],
  });
}

/** Donate: one row per trust (each pays into its own account), then running campaigns. Straight to amounts when there are no trusts. */
async function donateMenu(c: Ctx): Promise<BotReply> {
  const [campaigns, trusts] = await Promise.all([activeCampaignViews(), activeTrusts()]);
  if (!trusts.length && !campaigns.length) return donationMenu(c);
  const shownTrusts = trusts.slice(0, 9);
  const shownCampaigns = campaigns.slice(0, Math.max(0, 10 - shownTrusts.length - (trusts.length ? 0 : 1)));
  const sections = [] as { title?: string; rows: { id: string; title: string; description?: string }[] }[];
  const trustRows = shownTrusts.map((x) => ({ id: `dtrust:${x.slug}`, title: x.name.slice(0, 24), description: T(c, 'donate_link_d') }));
  if (!trusts.length) trustRows.push({ id: 'dtrust:amritvela', title: 'Amrit Vela Trust', description: T(c, 'donate_av_d') });
  sections.push({ title: T(c, 'donate_section'), rows: trustRows });
  if (shownCampaigns.length) sections.push({ title: T(c, 'donate_campaigns_section'), rows: shownCampaigns.map((x) => ({ id: `camp:${x.slug}`, title: x.title.slice(0, 24), description: T(c, 'camp_row_d', { raised: x.raised.toLocaleString('en-IN'), target: x.targetAmount.toLocaleString('en-IN') }) })) });
  return list(c, 'DONATE_WHICH', { body: T(c, 'donate_which_body'), button: T(c, 'trusts_button'), sections });
}

type Preset = { label: string; amount: number };
const presetsOf = (tr: { presets: unknown }): Preset[] =>
  (Array.isArray(tr.presets) ? (tr.presets as any[]) : []).map((x) => ({ label: String(x?.label ?? '').slice(0, 72), amount: Math.round(Number(x?.amount)) })).filter((x) => Number.isSafeInteger(x.amount) && x.amount >= 1 && x.amount <= MAX_DONATION).slice(0, 3);

/** Amount list for one trust: the admin's preset amounts first, then the usual ones, then "other amount". */
async function trustDonateReply(c: Ctx, slug: string): Promise<BotReply> {
  const tr = await db.trust.findFirst({ where: { slug, active: true } });
  if (!tr) return { intent: 'TRUST', text: T(c, 'trust_gone') };
  const presets = presetsOf(tr);
  const used = new Set(presets.map((x) => x.amount));
  const rows = [
    ...presets.map((x) => ({ id: `tamt:${slug}:${x.amount}`, title: `₹${x.amount.toLocaleString('en-IN')}`, ...(x.label ? { description: x.label } : {}) })),
    ...DONATION_AMOUNTS.filter((a) => !used.has(a)).slice(0, 9 - presets.length).map((a) => ({ id: `tamt:${slug}:${a}`, title: `₹${a.toLocaleString('en-IN')}` })),
    { id: `tamt:${slug}:other`, title: T(c, 'amt_other') },
  ];
  return list(c, 'DONATION_AMOUNT', { body: T(c, 'trust_amount_body', { trust: tr.name }), button: T(c, 'trust_amount_button'), sections: [{ title: T(c, 'donate_section'), rows }] });
}

/** The trust's QR code / UPI id (also the automatic fallback when no payment link can be made). */
function qrReply(c: Ctx, tr: { name: string; qrImageUrl: string | null; upiId: string | null; contactPhone: string | null }, lead?: string): BotReply {
  const qr = toWhatsAppImageUrl(tr.qrImageUrl);
  const lines = [lead ?? `*${tr.name}*`];
  if (tr.upiId) lines.push('', T(c, 'trust_upi_line', { upi: tr.upiId }));
  if (!qr && !tr.upiId) return { intent: 'TRUST_QR', text: T(c, 'trust_no_qr', { support: tr.contactPhone ? `📞 ${tr.contactPhone}` : t(c.lang, 'support') }) };
  const reply = buttons('TRUST_QR', lines.join('\n'), [{ id: 'menu:donate', title: T(c, 'b_donate') }, { id: 'menu:main', title: T(c, 'b_menu') }]);
  return qr ? { ...reply, image: { url: qr, caption: T(c, 'trust_qr_note', { name: tr.name }) } } : reply;
}

/** A campaign: image, description, goal / raised / percent, and the quick-amount list for that campaign. */
async function campaignReply(c: Ctx, slug: string): Promise<BotReply> {
  const row = await db.campaign.findUnique({ where: { slug } });
  if (!row || !isAcceptingDonations(row)) return { intent: 'CAMPAIGN', text: T(c, 'camp_gone') };
  const stats = (await campaignStats([row.id])).get(row.id)!;
  const v = toView(row as any, stats);
  const desc = descriptionFor(row, c.lang);
  const body = T(c, 'camp_body', { title: row.title, desc: desc.length > 420 ? `${desc.slice(0, 417)}…` : desc, target: row.targetAmount.toLocaleString('en-IN'), raised: stats.raised.toLocaleString('en-IN'), percent: v.percent });
  const reply = list(c, 'CAMPAIGN', {
    body, button: T(c, 'donate_button'),
    sections: [{ title: T(c, 'donate_section'), rows: [...DONATION_AMOUNTS.map((a) => ({ id: `camp:${slug}:${a}`, title: `₹${a.toLocaleString('en-IN')}` })), { id: `camp:${slug}:other`, title: T(c, 'amt_other') }] }],
  });
  const img = toWhatsAppImageUrl(row.imageUrl);
  return img ? { ...reply, image: { url: img, caption: row.title } } : reply;
}

const infoFor = (tr: { infoEn: string; infoHi: string | null; infoHing: string | null; infoPa: string | null; infoMr?: string | null }, lang: Lang) =>
  (lang === 'hi' ? tr.infoHi : lang === 'hing' ? tr.infoHing : lang === 'pa' ? tr.infoPa : lang === 'mr' ? tr.infoMr : null)?.trim() || tr.infoEn.trim();

/** Information about an admin-managed trust + the QR code donors scan to pay by PhonePe / any UPI app. */
async function managedTrustReply(c: Ctx, slug: string): Promise<BotReply> {
  const tr = await db.trust.findFirst({ where: { slug, active: true } });
  if (!tr) return { intent: 'TRUST', text: T(c, 'trust_gone') };
  const lines = [`*${tr.name}*`, '', infoFor(tr, c.lang)];
  const extra: string[] = [];
  if (tr.upiId) extra.push(T(c, 'trust_upi_line', { upi: tr.upiId }));
  if (tr.contactPhone) extra.push(`📞 ${tr.contactPhone}`);
  if (tr.contactEmail) extra.push(`✉️ ${tr.contactEmail}`);
  if (extra.length) lines.push('', ...extra);
  const qr = toWhatsAppImageUrl(tr.qrImageUrl);
  if (!qr) lines.push('', T(c, 'trust_no_qr', { support: tr.contactPhone ? `📞 ${tr.contactPhone}` : t(c.lang, 'support') }));
  const reply = buttons('TRUST', lines.join('\n'), [{ id: 'menu:info', title: T(c, 'b_trusts') }, { id: 'menu:donate', title: T(c, 'b_donate') }, { id: 'menu:main', title: T(c, 'b_menu') }]);
  return qr ? { ...reply, image: { url: qr, caption: T(c, 'trust_qr_note', { name: tr.name }) } } : reply;
}

/** Customer typed the name of an admin-managed trust ("nanak roti trust"). */
async function matchTrust(text: string) {
  const n = normalize(text).replace(/\s+/g, '');
  if (n.length < 4) return null;
  const trusts = await activeTrusts();
  return trusts.find((x) => { const name = normalize(x.name).replace(/\s+/g, ''); return name.length >= 4 && n.includes(name.replace(/trust$/, '')) && name.replace(/trust$/, '').length >= 4; }) ?? null;
}

async function docsMenu(c: Ctx): Promise<BotReply> {
  const docs = await activeDocuments();
  if (!docs.length) return { intent: 'DOCS', text: T(c, 'docs_none') };
  return list(c, 'DOCS', {
    body: T(c, 'docs_body'), button: T(c, 'docs_button'),
    sections: [{ title: T(c, 'docs_section'), rows: docs.map((d) => ({ id: `doc:${d.id}`, title: d.title, ...(d.description ? { description: d.description } : {}) })) }],
  });
}

/** Sends the PDF the customer picked (as a real WhatsApp document), or a download link on the website chat. */
async function documentReply(c: Ctx, id: string): Promise<BotReply> {
  const doc = await db.document.findFirst({ where: { id, active: true } });
  if (!doc) return { intent: 'DOCS', text: T(c, 'doc_missing') };
  const url = `${env.API_URL}/api/documents/${doc.id}/file`;
  await db.document.update({ where: { id: doc.id }, data: { downloads: { increment: 1 } } }).catch(() => undefined);
  if ((c.channel ?? 'whatsapp') === 'web') return { intent: 'DOCS', text: T(c, 'doc_web', { title: doc.title, url }) };
  return {
    intent: 'DOCS', text: T(c, 'doc_sending', { title: doc.title }),
    after: async () => {
      try { await sendWhatsAppPdf(c.phone, Buffer.from(doc.data), doc.fileName, doc.title); }
      catch (e: any) { console.error('[BOT] Document send failed:', e?.message || e); await sendWhatsAppText(c.phone, T(c, 'doc_fail', { url })); }
    },
  };
}

const DONATION_AMOUNTS = [101, 501, 1100, 2100, 5100];
function donationMenu(c: Ctx): BotReply {
  return list(c, 'DONATION_AMOUNT', {
    body: T(c, 'donate_body'), button: T(c, 'donate_button'),
    sections: [{ title: T(c, 'donate_section'), rows: [...DONATION_AMOUNTS.map((a) => ({ id: `amt:${a}`, title: `₹${a.toLocaleString('en-IN')}` })), { id: 'amt:other', title: T(c, 'amt_other') }] }],
  });
}

/** Pendrive & Mala are their own menu entry; everything else is "Other products". */
const isPendriveMala = (p: ProductRow) => /pen\s*-?drive|\bmala\b|माला|पेनड्राइव|ਮਾਲਾ|ਪੈਨਡ੍ਰਾਈਵ/i.test(`${p.name} ${p.slug}`);

function productMenu(c: Ctx, products: ProductRow[], group: 'all' | 'pm' | 'other' = 'all'): BotReply {
  const available = products.filter((p) => p.stock > 0 && (group === 'all' || (group === 'pm') === isPendriveMala(p)));
  if (!available.length) return { intent: 'SHOP', text: T(c, group === 'pm' ? 'pm_none' : group === 'other' ? 'other_none' : 'no_products') };
  return list(c, 'SHOP', {
    body: T(c, group === 'pm' ? 'pm_body' : 'product_list_body'), button: T(c, 'product_list_button'), footer: T(c, 'product_footer', { name: available[0].name }),
    sections: [{ title: T(c, 'product_list_section'), rows: available.slice(0, 10).map((p) => ({ id: `prod:${p.id}`, title: p.name, description: money(p.price) })) }],
  });
}

const stockHint = (c: Ctx, p: ProductRow) => (p.stock > 0 ? T(c, 'price_ok', { name: p.name, price: money(p.price) }) : T(c, 'price_out', { name: p.name, price: money(p.price) }));

/* ------------------------------------------------------------------ main router */

/**
 * Returns a reply for transactional/known intents, or null when the message should go to the grounded AI.
 */
export async function routeWhatsAppMessage(input: RouteInput): Promise<BotReply | null> {
  const user = await db.user.findUnique({ where: { phone: input.phone }, select: { language: true } });
  const chosen = normalizeLang(user?.language);
  const c: Ctx = { ...input, lang: chosen ?? DEFAULT_LANG, langChosen: Boolean(chosen) };
  const text = input.text.trim();

  // Taps on list rows / buttons carry an id and are handled before any text guessing.
  if (input.replyId) {
    const reply = await handleReplyId(c, input.replyId);
    if (reply) return reply;
  }

  const state = await readState(c.conversationId);
  const inConfirm = state?.step === 'AWAIT_CONFIRM';

  if (hasHumanIntent(text)) return humanReply(c);

  if (isLanguageRequest(text)) { await writeState(c.conversationId, null); return languageMenu(c); }

  if (isMenuWord(text) || isGreeting(text)) {
    await writeState(c.conversationId, null);
    return c.langChosen ? mainMenu(c) : languageMenu(c);
  }

  // Live Kirtan opt-out / opt-in. With a checkout in progress "stop" still means "cancel this".
  if (!state && isAlertsOff(text)) { await db.user.update({ where: { phone: c.phone }, data: { liveAlerts: false } }); return { intent: 'ALERTS', text: T(c, 'alerts_off') }; }
  if (isAlertsOn(text)) { await db.user.update({ where: { phone: c.phone }, data: { liveAlerts: true } }); return { intent: 'ALERTS', text: T(c, 'alerts_on') }; }

  if (isCancelOrMenu(text) || (inConfirm && isNo(text))) {
    const wasActive = Boolean(state);
    await writeState(c.conversationId, null);
    return wasActive ? { intent: 'CANCEL', text: T(c, state && (state.step === 'CART' || state.step === 'AWAIT_PRODUCT') && state.items.length ? 'cart_cleared' : 'cancelled_ok') } : mainMenu(c);
  }

  // Payment claims / receipt requests / explicit references. Never swallowed by a stale checkout state.
  const addressInProgress = state?.step === 'AWAIT_ADDRESS' && Boolean(extractPin(text));
  const confirmingAnswer = inConfirm && isYes(text);
  if (!addressInProgress && !confirmingAnswer) {
    const donRef = extractDonationRef(text);
    const ordRef = extractOrderRef(text);
    const purchaseVerb = /kharid|khareed|buy|purchase|chahiye|chaiye|lena|mangwa|खरीद|चाहिए|ਖਰੀਦ|ਚਾਹੀਦਾ/i.test(text);
    if (isReceiptRequest(text) || isPaymentClaim(text) || donRef || ordRef || (hasTrackIntent(text) && !purchaseVerb)) {
      const reply = await handlePaymentQuery(c, text, { donRef, ordRef });
      if (reply) return reply;
    }
  }

  if (state) {
    const reply = await handleState(c, text, state);
    if (reply) return reply;
  }

  if (hasDonationIntent(text)) return handleDonationStart(c, text);

  const trust = await matchTrust(text);
  if (trust) return managedTrustReply(c, trust.slug);
  // "pdf chahiye" / "instagram link" / "live kirtan" are not product orders, unless the message also names a product.
  if (hasSocialIntent(text) || hasDocsIntent(text) || hasLiveIntent(text)) {
    const namesProduct = parseCartItems(text, await loadProducts()).items.length > 0;
    if (!namesProduct) return hasLiveIntent(text) ? liveReply(c) : hasSocialIntent(text) ? socialReply(c) : docsMenu(c);
  }

  return handleShop(c, text);
}

function humanReply(c: Ctx): BotReply {
  void writeState(c.conversationId, null);
  return { intent: 'HUMAN', text: T(c, 'human_ack') };
}

/* ------------------------------------------------------------------ taps on list rows / buttons */

async function handleReplyId(c: Ctx, id: string): Promise<BotReply | null> {
  const i = id.indexOf(':');
  const kind = i < 0 ? id : id.slice(0, i);
  const arg = i < 0 ? '' : id.slice(i + 1);

  switch (kind) {
    case 'lang': {
      if (!isLang(arg)) return null;
      await db.user.update({ where: { phone: c.phone }, data: { language: arg } });
      await writeState(c.conversationId, null);
      const next: Ctx = { ...c, lang: arg, langChosen: true };
      return mainMenu(next, t(arg, 'lang_set'));
    }
    case 'menu': {
      switch (arg) {
        case 'main': await writeState(c.conversationId, null); return mainMenu(c);
        case 'info': await writeState(c.conversationId, null); return trustsMenu(c, 'info');
        case 'contact': await writeState(c.conversationId, null); return contactReply(c);
        case 'social': await writeState(c.conversationId, null); return socialReply(c);
        case 'docs': await writeState(c.conversationId, null); return docsMenu(c);
        case 'lang': await writeState(c.conversationId, null); return languageMenu(c);
        case 'human': return humanReply(c);
        case 'donate': await writeState(c.conversationId, null); return donateMenu(c);
        case 'channel': await writeState(c.conversationId, null); return channelReply(c);
        case 'more': await writeState(c.conversationId, null); return moreMenu(c);
        case 'rooms': await writeState(c.conversationId, null); return roomsReply(c);
        case 'pm':
        case 'otherprod': {
          const state = await readState(c.conversationId);
          const items = state && 'items' in state ? state.items : [];
          await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now(), items });
          return productMenu(c, await loadProducts(), arg === 'pm' ? 'pm' : 'other');
        }
        case 'live': await writeState(c.conversationId, null); return liveReply(c);
        case 'products': {
          const state = await readState(c.conversationId);
          const items = state && 'items' in state ? state.items : [];
          await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now(), items });
          return productMenu(c, await loadProducts());
        }
        case 'status': return (await handlePaymentQuery(c, 'order status', { donRef: null, ordRef: null })) ?? { intent: 'PAYMENT_NONE', text: T(c, 'pay_none') };
        case 'receipt': return (await handlePaymentQuery(c, 'receipt', { donRef: null, ordRef: null })) ?? { intent: 'PAYMENT_NONE', text: T(c, 'pay_none') };
      }
      return null;
    }
    case 'trust': {
      await writeState(c.conversationId, null);
      return arg === 'amritvelatrust' || arg === 'amritvela' ? topicsMenu(c) : managedTrustReply(c, arg);
    }
    case 'dtrust': {
      await writeState(c.conversationId, null);
      return arg === 'amritvela' ? donationMenu(c) : trustDonateReply(c, arg);
    }
    case 'tamt': {
      const j = arg.lastIndexOf(':');
      const slug = arg.slice(0, j), amountArg = arg.slice(j + 1);
      const tr = j > 0 ? await db.trust.findFirst({ where: { slug, active: true } }) : null;
      if (!tr) return { intent: 'TRUST', text: T(c, 'trust_gone') };
      if (amountArg === 'other') {
        await writeState(c.conversationId, { step: 'AWAIT_DONATION_AMOUNT', at: Date.now(), trustId: tr.id });
        return { intent: 'DONATION_AMOUNT', text: T(c, 'trust_amount_type', { trust: tr.name }) };
      }
      const amount = Number(amountArg);
      if (!DONATION_AMOUNTS.includes(amount) && !presetsOf(tr).some((x) => x.amount === amount)) return null;
      return donationWithAmount(c, amount, undefined, tr.id);
    }
    case 'qr': {
      const tr = await db.trust.findFirst({ where: { slug: arg, active: true } });
      return tr ? qrReply(c, tr) : { intent: 'TRUST', text: T(c, 'trust_gone') };
    }
    case 'room': {
      if (arg !== 'start') return null;
      const user = await db.user.findUnique({ where: { phone: c.phone } });
      if (user?.name) { await writeState(c.conversationId, { step: 'ROOM', at: Date.now(), stage: 'date', name: user.name }); return { intent: 'ROOM', text: T(c, 'room_ask_date') }; }
      await writeState(c.conversationId, { step: 'ROOM', at: Date.now(), stage: 'name' });
      return { intent: 'ROOM', text: T(c, 'room_ask_name') };
    }
    case 'info': {
      if (!(TOPICS as readonly string[]).includes(arg)) return null;
      await writeState(c.conversationId, null);
      return topicReply(c, arg as Topic);
    }
    case 'doc': return documentReply(c, arg);
    case 'camp': {
      const [slug, amountArg] = arg.split(':');
      if (!amountArg) { await writeState(c.conversationId, null); return campaignReply(c, slug); }
      const campaign = await db.campaign.findUnique({ where: { slug } });
      if (!campaign || !isAcceptingDonations(campaign)) return { intent: 'CAMPAIGN', text: T(c, 'camp_gone') };
      if (amountArg === 'other') {
        await writeState(c.conversationId, { step: 'AWAIT_DONATION_AMOUNT', at: Date.now(), campaignId: campaign.id });
        return { intent: 'DONATION_AMOUNT', text: T(c, 'donate_ask_amount') };
      }
      const amount = Number(amountArg);
      if (!DONATION_AMOUNTS.includes(amount)) return null;
      return donationWithAmount(c, amount, campaign.id);
    }
    case 'amt': {
      if (arg === 'other') {
        await writeState(c.conversationId, { step: 'AWAIT_DONATION_AMOUNT', at: Date.now() });
        return { intent: 'DONATION_AMOUNT', text: T(c, 'donate_ask_amount') };
      }
      const amount = Number(arg);
      if (!DONATION_AMOUNTS.includes(amount)) return null;
      return donationWithAmount(c, amount);
    }
    case 'prod': {
      const products = await loadProducts();
      const product = products.find((p) => p.id === arg);
      if (!product) return { intent: 'SHOP', text: T(c, 'product_not_found') };
      const state = await readState(c.conversationId);
      const items = state && 'items' in state ? state.items : [];
      // Tapping a product adds one more of it to the cart.
      const existing = items.find((x) => x.productId === product.id);
      return applyToCart(c, items, [{ product, qty: existing ? existing.qty + 1 : 1 }], [], products, { mode: 'cart' });
    }
    case 'cart': {
      const state = await readState(c.conversationId);
      const items = state && 'items' in state ? state.items : [];
      if (arg === 'clear') { await writeState(c.conversationId, null); return { intent: 'CANCEL', text: T(c, 'cart_cleared') }; }
      if (!items.length) return productMenu(c, await loadProducts());
      if (arg === 'more') { await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now(), items }); return productMenu(c, await loadProducts()); }
      if (arg === 'checkout') return checkoutStep(c, items, await loadProducts());
      return null;
    }
    case 'cfm': {
      const state = await readState(c.conversationId);
      if (state?.step !== 'AWAIT_CONFIRM') return mainMenu(c); // stale button from an expired session
      if (arg === 'yes') return placeOrder(c, state);
      if (arg === 'addr') {
        await writeState(c.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), items: state.items });
        return { intent: 'SHOP', text: T(c, 'new_address') };
      }
      await writeState(c.conversationId, null);
      return { intent: 'CANCEL', text: T(c, 'cancelled_ok') };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ live kirtan */

async function liveReply(c: Ctx): Promise<BotReply> {
  const live = await liveStatusForBot(c.lang);
  if (!live.url || !live.enabled) return { intent: 'LIVE', text: T(c, 'live_none') };
  if (live.isLiveNow) return buttons('LIVE', T(c, 'live_now_reply', { title: live.title, url: live.url }), [{ id: 'menu:main', title: T(c, 'b_menu') }]);
  const text = live.timings ? T(c, 'live_next_reply', { title: live.title, timings: live.timings, url: live.url }) : T(c, 'live_no_timings', { title: live.title, url: live.url });
  return buttons('LIVE', text, [{ id: 'menu:main', title: T(c, 'b_menu') }]);
}

/* ------------------------------------------------------------------ donations */

async function donationWithAmount(c: Ctx, amount: number, campaignId?: string, trustId?: string): Promise<BotReply> {
  // A QR-only trust has no payment link: show the QR straight away, no name needed.
  if (trustId) {
    const tr = await db.trust.findUnique({ where: { id: trustId } });
    if (!tr || !tr.active) { await writeState(c.conversationId, null); return { intent: 'TRUST', text: T(c, 'trust_closed') }; }
    if (tr.accountMode === 'QR_ONLY') { await writeState(c.conversationId, null); return qrReply(c, tr); }
  }
  const user = await db.user.findUnique({ where: { phone: c.phone } });
  if (!user?.name) {
    await writeState(c.conversationId, { step: 'AWAIT_DONATION_NAME', at: Date.now(), amount, ...(campaignId ? { campaignId } : {}), ...(trustId ? { trustId } : {}) });
    return { intent: 'DONATION_NAME', text: T(c, 'donate_ask_name', { amount: amount.toLocaleString('en-IN') }) };
  }
  return createDonationReply(c, amount, campaignId, trustId);
}

async function handleDonationStart(c: Ctx, text: string, allowBare = false, scope: { campaignId?: string; trustId?: string } = {}): Promise<BotReply> {
  const parsed = parseAmount(text, { allowBare });
  if (parsed.amount == null) {
    if (parsed.reason === 'decimal') return { intent: 'DONATION_AMOUNT', text: T(c, 'donate_decimal') };
    if (parsed.reason === 'range') return { intent: 'DONATION_AMOUNT', text: T(c, 'donate_range', { max: MAX_DONATION.toLocaleString('en-IN') }) };
    // No amount typed: offer the quick-amount list (customers can still type any amount).
    await writeState(c.conversationId, { step: 'AWAIT_DONATION_AMOUNT', at: Date.now(), ...scope });
    return donationMenu(c);
  }
  return donationWithAmount(c, parsed.amount, scope.campaignId, scope.trustId);
}

async function createDonationReply(c: Ctx, amount: number, campaignId?: string, trustId?: string): Promise<BotReply> {
  await writeState(c.conversationId, null);
  const trust = trustId ? await db.trust.findUnique({ where: { id: trustId } }) : null;
  try {
    const user = await db.user.findUnique({ where: { phone: c.phone } });
    const result = await createDonationLink({ phone: c.phone, name: user?.name, email: user?.email, amount, lang: c.lang, campaignId, trustId });
    if (result.mock) return { intent: 'DONATION', text: T(c, 'donate_mock', { ref: result.reference }) };
    // Offer the QR next to the link when this trust has one: some donors' payment apps do not open links.
    if (trust?.offerQr && (trust.qrImageUrl || trust.upiId)) {
      return buttons('DONATION', result.message, [{ id: `qr:${trust.slug}`, title: T(c, 'b_qr') }, { id: 'menu:main', title: T(c, 'b_menu') }]);
    }
    return { intent: 'DONATION', text: result.message };
  } catch (e: any) {
    if (e?.code === 'CAMPAIGN_CLOSED') return { intent: 'CAMPAIGN', text: T(c, 'camp_gone') };
    if (e?.code === 'TRUST_CLOSED') return { intent: 'TRUST', text: T(c, 'trust_closed') };
    console.error('[BOT] Donation link creation failed:', e?.error?.description || e?.message || e);
    // No link possible: fall back to this trust's QR code if it has one.
    if (trust && (trust.qrImageUrl || trust.upiId)) return qrReply(c, trust, T(c, 'qr_fallback', { trust: trust.name }));
    return { intent: 'DONATION_ERROR', text: T(c, 'link_error') };
  }
}

/* ------------------------------------------------------------------ payment status / receipts */

async function handlePaymentQuery(c: Ctx, text: string, refs: { donRef: string | null; ordRef: string | null }): Promise<BotReply | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let donation = null as Awaited<ReturnType<typeof db.donation.findFirst>>;
  let order = null as Awaited<ReturnType<typeof db.order.findFirst>>;

  if (refs.donRef) {
    donation = await db.donation.findFirst({ where: { reference: refs.donRef, user: { phone: c.phone } } });
    if (!donation) return { intent: 'DONATION_STATUS', text: T(c, 'notfound_don', { ref: refs.donRef }) };
  } else if (refs.ordRef) {
    order = await db.order.findFirst({ where: { orderNumber: refs.ordRef, user: { phone: c.phone } } });
    if (!order) return { intent: 'ORDER_STATUS', text: T(c, 'notfound_ord', { ref: refs.ordRef }) };
  } else {
    const [d, o] = await Promise.all([
      db.donation.findFirst({ where: { user: { phone: c.phone }, createdAt: { gte: since }, paymentStatus: { not: 'FAILED' } }, orderBy: { createdAt: 'desc' } })
        .then((x) => x ?? db.donation.findFirst({ where: { user: { phone: c.phone }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } })),
      db.order.findFirst({ where: { user: { phone: c.phone }, createdAt: { gte: since }, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } }),
    ]);
    const mentionsOrder = /order|product|saman|samaan|parcel|delivery|invoice|ऑर्डर/i.test(text);
    const mentionsDonation = hasDonationIntent(text);
    if (mentionsOrder && !mentionsDonation) order = o;
    else if (mentionsDonation && !mentionsOrder) donation = d;
    else if (d && o) { if (d.createdAt >= o.createdAt) donation = d; else order = o; }
    else { donation = d; order = o; }

    if (!donation && !order) {
      // "done"/"ok" style one-liners with no records are ambiguous: let normal routing continue.
      if (!isReceiptRequest(text) && !hasTrackIntent(text) && !/payment|donation|paid/i.test(text)) return null;
      return { intent: 'PAYMENT_NONE', text: T(c, 'pay_none') };
    }
  }

  if (donation) return donationStatusReply(c, donation.id);
  if (order) return orderStatusReply(c, order.id, /invoice|receipt|bill|रसीद|पावती|ਰਸੀਦ/i.test(text));
  return null;
}

async function donationStatusReply(c: Ctx, donationId: string): Promise<BotReply> {
  const channel = c.channel ?? 'whatsapp';
  let rec;
  try { rec = await reconcileDonation(donationId); } catch (e: any) { console.error('[BOT] reconcileDonation failed:', e?.message || e); }
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { user: true } });
  if (!d) return { intent: 'DONATION_STATUS', text: T(c, 'record_missing') };
  const amount = d.amount.toLocaleString('en-IN');

  if (d.paymentStatus === 'PAID') {
    const lead = T(c, rec?.justPaid ? 'don_lead_just' : 'don_lead', { amount });
    const url = `${env.API_URL}/api/donations/${d.id}/receipt`;
    if (channel === 'web') return { intent: 'DONATION_RECEIPT', text: T(c, 'don_paid_web', { lead, ref: d.reference, url }) };
    return {
      intent: 'DONATION_RECEIPT',
      text: T(c, 'don_paid_wa', { lead, ref: d.reference }),
      after: async () => {
        try { await sendReceiptPdf(d.id); }
        catch (e: any) {
          console.error('[BOT] Receipt PDF send failed:', e?.message || e);
          await sendWhatsAppText(d.user.phone, T(c, 'receipt_pdf_fail', { url }));
        }
      },
    };
  }

  const ref = `${d.reference} (₹${amount})`;
  if (!rec || rec.unverified) return { intent: 'DONATION_STATUS', text: T(c, 'don_unverified', { ref, status: d.paymentStatus }) };
  if (rec.status === 'EXPIRED') return { intent: 'DONATION_STATUS', text: T(c, 'don_expired', { ref }) };
  if (rec.status === 'CANCELLED') return { intent: 'DONATION_STATUS', text: T(c, 'don_cancelled', { ref }) };
  return { intent: 'DONATION_STATUS', text: T(c, 'don_pending', { ref }) };
}

async function orderStatusReply(c: Ctx, orderId: string, wantsInvoice: boolean): Promise<BotReply> {
  const channel = c.channel ?? 'whatsapp';
  let rec;
  try { rec = await reconcileOrder(orderId); } catch (e: any) { console.error('[BOT] reconcileOrder failed:', e?.message || e); }
  const o = await db.order.findUnique({ where: { id: orderId }, include: { user: true, items: { include: { product: true } } } });
  if (!o) return { intent: 'ORDER_STATUS', text: T(c, 'record_missing') };

  const base = T(c, 'ord_base', { number: o.orderNumber, items: o.items.map((i) => `${i.product.name} x ${i.quantity}`).join(', '), total: money(o.total) });

  if (o.paymentStatus !== 'PAID') {
    if (!rec || rec.unverified) return { intent: 'ORDER_STATUS', text: T(c, 'ord_unverified', { base, status: o.paymentStatus }) };
    if (rec.status === 'EXPIRED') return { intent: 'ORDER_STATUS', text: T(c, 'ord_expired', { base }) };
    if (rec.status === 'CANCELLED') return { intent: 'ORDER_STATUS', text: T(c, 'ord_cancelled', { base }) };
    return { intent: 'ORDER_STATUS', text: T(c, 'ord_pending', { base }) };
  }

  const statusKey = `os_${o.status}` as MessageKey;
  const lines = [base, T(c, 'ord_verified'), T(c, 'ord_status', { status: statusKey in M ? t(c.lang, statusKey) : o.status })];
  if (o.courier) lines.push(T(c, 'ord_courier', { x: o.courier }));
  if (o.awb) lines.push(T(c, 'ord_awb', { x: o.awb }));
  if (o.trackingUrl) lines.push(T(c, 'ord_tracking', { x: o.trackingUrl }));
  if (!o.awb && ['CONFIRMED', 'PROCESSING'].includes(o.status)) lines.push(T(c, 'ord_dispatch_note'));
  if (rec?.justPaid) lines.push(`\n${T(c, 'ord_just_paid')}`);
  if (channel === 'web' && wantsInvoice) lines.push(T(c, 'ord_invoice_web', { url: `${env.API_URL}/api/orders/${o.id}/invoice` }));
  return {
    intent: 'ORDER_STATUS',
    text: lines.join('\n'),
    after: channel !== 'web' && wantsInvoice && !rec?.justPaid ? async () => { await sendOrderInvoice(o.id).catch(async (e) => { console.error('[BOT] Invoice send failed:', e?.message || e); await sendWhatsAppText(o.user.phone, T(c, 'invoice_fail')); }); } : undefined,
  };
}


/* ------------------------------------------------------------------ cart + checkout */

type Next = { mode: 'cart' | 'checkout'; keep?: { address: string; pin: string } };
type Mention = CartMention<ProductRow>;

async function cartView(c: Ctx, items: CartItem[], products: ProductRow[]) {
  const rows = items.map((i) => ({ p: products.find((x) => x.id === i.productId), qty: i.qty })).filter((r): r is { p: ProductRow; qty: number } => Boolean(r.p));
  const subtotal = rows.reduce((n, r) => n + r.p.price * r.qty, 0);
  const lines = rows.map((r) => `• ${r.p.name} x ${r.qty} — ${money(r.p.price * r.qty)}`).join('\n');
  return { rows, subtotal, lines, fee: shippingFor(rows.map((r) => ({ deliveryCharge: r.p.deliveryCharge, qty: r.qty })), subtotal, await getFreeShippingAbove()), example: rows[0]?.p.name ?? 'Nariyal' };
}

/** Adds / changes / removes products in the cart, then shows the cart or moves on to checkout. */
async function applyToCart(c: Ctx, items: CartItem[], mentions: Mention[], removed: ProductRow[], products: ProductRow[], next: Next): Promise<BotReply> {
  const hadItems = items.length > 0;
  const cart = items.filter((x) => products.some((p) => p.id === x.productId)).map((x) => ({ ...x }));
  const notices: string[] = [];
  for (const m of mentions) {
    const p = m.product;
    const existing = cart.find((x) => x.productId === p.id);
    const qty = m.qty ?? (existing ? existing.qty : 1);
    if (p.stock < 1) return { intent: 'SHOP', text: T(c, 'out_of_stock', { name: p.name }) };
    if (qty > p.stock) return { intent: 'SHOP', text: T(c, 'qty_too_many', { name: p.name }) };
    if (existing) { if (existing.qty !== qty) { existing.qty = qty; notices.push(T(c, 'notice_updated', { name: p.name, qty })); } }
    else {
      if (cart.length >= MAX_CART_LINES) return { intent: 'SHOP', text: T(c, 'cart_limit') };
      cart.push({ productId: p.id, qty }); notices.push(T(c, 'notice_added', { name: p.name, qty }));
    }
  }
  for (const r of removed) {
    const at = cart.findIndex((x) => x.productId === r.id);
    if (at >= 0) { cart.splice(at, 1); notices.push(T(c, 'notice_removed', { name: r.name })); }
  }
  if (!cart.length) {
    await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now(), items: [] });
    return productMenu(c, products);
  }
  const show = next.mode === 'cart' || hadItems ? notices : [];
  const image = cart.length === 1 && !hadItems ? productImage(products.find((p) => p.id === cart[0].productId)!) : undefined;
  return next.mode === 'cart' ? cartReply(c, cart, products, show, image) : checkoutStep(c, cart, products, next.keep, show, image);
}

async function cartReply(c: Ctx, items: CartItem[], products: ProductRow[], notices: string[] = [], image?: BotReply['image']): Promise<BotReply> {
  await writeState(c.conversationId, { step: 'CART', at: Date.now(), items });
  const v = await cartView(c, items, products);
  const body = `${notices.length ? `${notices.join('\n')}\n\n` : ''}${T(c, 'cart_body', { lines: v.lines, subtotal: money(v.subtotal), example: v.example })}`;
  return { ...buttons('CART', body, [{ id: 'cart:checkout', title: T(c, 'b_checkout') }, { id: 'cart:more', title: T(c, 'b_add_more') }, { id: 'cart:clear', title: T(c, 'b_clear') }]), ...(image ? { image } : {}) };
}

/** Next missing piece of the order: name -> address -> confirmation. */
async function checkoutStep(c: Ctx, items: CartItem[], products: ProductRow[], keep?: { address: string; pin: string }, notices: string[] = [], image?: BotReply['image']): Promise<BotReply> {
  const v = await cartView(c, items, products);
  if (!v.rows.length) return productMenu(c, products);
  const head = notices.length ? `${notices.join('\n')}\n\n` : '';
  const user = await db.user.findUnique({ where: { phone: c.phone } });
  if (!user?.name) {
    await writeState(c.conversationId, { step: 'AWAIT_NAME', at: Date.now(), items, ...(keep || {}) });
    return { intent: 'SHOP', ...(image ? { image } : {}), text: `${head}${T(c, 'ask_name_cart', { lines: v.lines })}` };
  }
  if (keep) return confirmationReply(c, items, products, user.name, keep.address, keep.pin, notices);
  await writeState(c.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), items });
  return { intent: 'SHOP', ...(image ? { image } : {}), text: `${head}${T(c, 'ask_address_cart', { lines: v.lines, subtotal: money(v.subtotal), fee: v.fee === 0 ? T(c, 'fee_free') : money(v.fee), example: v.example })}` };
}

async function confirmationReply(c: Ctx, items: CartItem[], products: ProductRow[], name: string, address: string, pin: string, notices: string[] = []): Promise<BotReply> {
  await writeState(c.conversationId, { step: 'AWAIT_CONFIRM', at: Date.now(), items, address, pin });
  const v = await cartView(c, items, products);
  const body = `${notices.length ? `${notices.join('\n')}\n\n` : ''}${T(c, 'confirm_summary', { lines: v.lines, price: money(v.subtotal), fee: v.fee === 0 ? T(c, 'fee_free') : money(v.fee), total: money(v.subtotal + v.fee), name, address })}`;
  return buttons('SHOP_CONFIRM', body, [{ id: 'cfm:yes', title: T(c, 'b_confirm') }, { id: 'cfm:addr', title: T(c, 'b_address') }, { id: 'cfm:no', title: T(c, 'b_cancel') }]);
}

/* ------------------------------------------------------------------ shop (stateless entry) */

const normalizeBare = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\u0a00-\u0a7f]+/g, '');

async function handleShop(c: Ctx, text: string): Promise<BotReply | null> {
  const products = await loadProducts();
  const { items: mentions, removed } = parseCartItems(text, products);

  if (mentions.length) {
    const buy = hasBuyIntent(text);
    const single = mentions.length === 1 ? mentions[0].product : null;
    if (single && hasPhotoIntent(text) && !buy) {
      const image = productImage(single);
      const hint = single.stock > 0 ? ` ${T(c, 'order_hint', { name: single.name })}` : '';
      return { intent: 'SHOP', image, text: image ? `${stockHint(c, single)}${hint}` : `${T(c, 'photo_none', { name: single.name })} ${stockHint(c, single)}${hint}` };
    }
    if (!buy && hasPriceIntent(text)) {
      const first = mentions.find((m) => m.product.stock > 0)?.product;
      return { intent: 'SHOP', image: mentions.length === 1 ? productImage(mentions[0].product) : undefined, text: `${mentions.map((m) => stockHint(c, m.product)).join('\n')}${first ? `\n${T(c, 'order_hint', { name: first.name })}` : ''}` };
    }
    const bare = mentions.length === 1 && normalizeBare(text) === normalizeBare(mentions[0].product.name);
    if (buy || mentions.length > 1 || mentions.some((m) => m.qty !== null) || bare) return applyToCart(c, [], mentions, removed, products, { mode: 'checkout' });
    return null;
  }
  if (removed.length && hasBuyIntent(text)) {
    await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now(), items: [] });
    return productMenu(c, products);
  }
  if (hasCatalogIntent(text) || (hasBuyIntent(text) && /order|kharid|khareed|buy|purchase|चाहिए|खरीद|ऑर्डर|ਖਰੀਦ|ਆਰਡਰ|product|saman/i.test(text) && !hasDonationIntent(text))) {
    await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now(), items: [] });
    return productMenu(c, products);
  }
  return null;
}

/* ------------------------------------------------------------------ state machine */

async function handleState(c: Ctx, text: string, state: State): Promise<BotReply | null> {
  switch (state.step) {
    case 'AWAIT_DONATION_AMOUNT': {
      const parsed = parseAmount(text, { allowBare: true });
      if (parsed.amount != null) return donationWithAmount(c, parsed.amount, state.campaignId, state.trustId);
      if (parsed.reason === 'decimal' || parsed.reason === 'range') return handleDonationStart(c, text, true, { campaignId: state.campaignId, trustId: state.trustId });
      // A product message while waiting for an amount: leave donation mode.
      if (parseCartItems(text, await loadProducts()).items.length || hasBuyIntent(text) || hasCatalogIntent(text)) { await writeState(c.conversationId, null); return null; }
      return { intent: 'DONATION_AMOUNT', text: T(c, 'donate_amount_retry') };
    }

    case 'AWAIT_DONATION_NAME': {
      const name = validateName(text);
      if (!name.ok) return { intent: 'DONATION_NAME', text: T(c, 'donate_name_retry') };
      await db.user.update({ where: { phone: c.phone }, data: { name: name.name } });
      return createDonationReply(c, state.amount, state.campaignId, state.trustId);
    }

    case 'ROOM': return handleRoom(c, text, state);

    case 'AWAIT_PRODUCT':
    case 'CART': {
      const products = await loadProducts();
      const { items: mentions, removed } = parseCartItems(text, products);
      if (mentions.length || removed.length) return applyToCart(c, state.items, mentions, removed, products, { mode: 'cart' });
      if (hasDonationIntent(text)) { await writeState(c.conversationId, null); return null; }
      if (state.step === 'CART') {
        if (isYes(text) && state.items.length) return checkoutStep(c, state.items, products);
        if (hasCatalogIntent(text)) { await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now(), items: state.items }); return productMenu(c, products); }
        return null; // not about the cart: let the normal routing answer (the cart stays for 30 minutes)
      }
      if (normalize(text).split(' ').length > 4) return null;
      const menu = productMenu(c, products);
      const lead = T(c, 'product_not_found');
      return { ...menu, text: `${lead}\n\n${menu.text}`, interactive: menu.interactive && menu.interactive.kind === 'list' ? { ...menu.interactive, body: `${lead}\n\n${menu.interactive.body}` } : menu.interactive };
    }

    case 'AWAIT_NAME':
    case 'AWAIT_ADDRESS':
    case 'AWAIT_CONFIRM': {
      const products = await loadProducts();
      // Drop lines whose product disappeared or sold out while the customer was typing.
      const live = state.items.filter((i) => { const p = products.find((x) => x.id === i.productId); return p && p.stock >= 1; });
      if (!live.length) {
        await writeState(c.conversationId, null);
        const menu = productMenu(c, products);
        const gone = T(c, 'cart_sold_out');
        return { ...menu, text: `${gone}\n\n${menu.text}`, interactive: menu.interactive && menu.interactive.kind === 'list' ? { ...menu.interactive, body: `${gone}\n\n${menu.interactive.body}` } : menu.interactive };
      }
      const keep = state.step === 'AWAIT_CONFIRM' ? { address: state.address, pin: state.pin } : state.step === 'AWAIT_NAME' && state.address ? { address: state.address, pin: state.pin! } : undefined;
      const check = validateAddress(text);
      const pin = extractPin(text);
      const { items: mentions, removed } = parseCartItems(text, products);
      const nameLike = state.step === 'AWAIT_NAME' && !hasBuyIntent(text) && mentions.length <= 1 && mentions.every((m) => m.qty === null); // a customer may be called "Mala"

      // The customer edits the cart while checking out ("also 2 gangajal", "mala nahi"). An address with a PIN always wins.
      if ((mentions.length || removed.length) && !(check.ok && pin) && !nameLike) {
        return applyToCart(c, live, mentions, removed, products, { mode: 'checkout', keep });
      }

      if (state.step === 'AWAIT_NAME') {
        const name = validateName(text);
        if (!name.ok) return { intent: 'SHOP', text: T(c, 'name_retry') };
        await db.user.update({ where: { phone: c.phone }, data: { name: name.name } });
        if (state.address && state.pin) return confirmationReply(c, live, products, name.name, state.address, state.pin);
        await writeState(c.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), items: live });
        return { intent: 'SHOP', text: T(c, 'name_then_address') };
      }

      const qty = parseExplicitQuantity(text);
      if (qty != null && live.length === 1) {
        const p = products.find((x) => x.id === live[0].productId)!;
        if (qty > p.stock) return { intent: 'SHOP', text: T(c, 'qty_too_many', { name: p.name }) };
        return applyToCart(c, live, [{ product: p, qty }], [], products, { mode: 'checkout', keep });
      }

      if (state.step === 'AWAIT_CONFIRM' && isYes(text)) return placeOrder(c, { ...state, items: live });
      if (state.step === 'AWAIT_CONFIRM' && /address|pata|badal|change|पता|ਪਤਾ|बदल|ਬਦਲ/i.test(text) && !pin) {
        await writeState(c.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), items: live });
        return { intent: 'SHOP', text: T(c, 'new_address') };
      }

      if (!check.ok) {
        if (state.step === 'AWAIT_CONFIRM') return { intent: 'SHOP', text: T(c, 'confirm_hint') };
        return { intent: 'SHOP', text: T(c, check.reason) };
      }
      const u = await db.user.findUnique({ where: { phone: c.phone } });
      if (!u?.name) {
        await writeState(c.conversationId, { step: 'AWAIT_NAME', at: Date.now(), items: live, address: check.address, pin: check.pin });
        return { intent: 'SHOP', text: T(c, 'address_then_name') };
      }
      return confirmationReply(c, live, products, u.name, check.address, check.pin);
    }
  }
}

async function placeOrder(c: Ctx, state: Extract<State, { step: 'AWAIT_CONFIRM' }>): Promise<BotReply> {
  const fresh = await db.product.findMany({ where: { id: { in: state.items.map((i) => i.productId) } } });
  const bad = state.items.filter((i) => { const p = fresh.find((x) => x.id === i.productId); return !p || !isSellable(p) || p.stock < i.qty; });
  if (bad.length) {
    const names = bad.map((i) => fresh.find((x) => x.id === i.productId)?.name || '—').join(', ');
    const products = await loadProducts();
    const keepItems = state.items.filter((i) => !bad.includes(i));
    if (!keepItems.length) { await writeState(c.conversationId, null); return { intent: 'SHOP', text: T(c, 'cart_unavailable', { names }) }; }
    return cartReply(c, keepItems, products, [T(c, 'cart_unavailable', { names })]);
  }
  const user = await db.user.findUnique({ where: { phone: c.phone } });
  if (!user) return { intent: 'SHOP', text: T(c, 'profile_missing') };

  const rows = state.items.map((i) => ({ p: fresh.find((x) => x.id === i.productId)!, qty: i.qty }));
  const subtotal = rows.reduce((n, r) => n + r.p.price * r.qty, 0);
  const shippingFee = shippingFor(rows.map((r) => ({ deliveryCharge: r.p.deliveryCharge, qty: r.qty })), subtotal, await getFreeShippingAbove());
  const total = subtotal + shippingFee;
  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

  const order = await db.order.create({
    data: {
      orderNumber, userId: user.id, subtotal, shippingFee, total,
      address: { full: state.address, pin: state.pin },
      items: { create: rows.map((r) => ({ productId: r.p.id, quantity: r.qty, unitPrice: r.p.price })) },
    },
  });
  await db.user.update({ where: { id: user.id }, data: { address: { full: state.address, pin: state.pin } } }).catch(() => undefined);

  try {
    const link: any = await createOrderPaymentLink({ amount: total, orderNumber, name: user.name, email: user.email, phone: c.phone });
    const url = String(link?.short_url || '');
    if (!link?.id || !url) throw new Error('Payment provider did not return a payment URL');
    await db.order.update({ where: { id: order.id }, data: { razorpayOrderId: String(link.id) } });
    await writeState(c.conversationId, null);
    if (String(link.id).startsWith('mock_')) return { intent: 'SHOP_ORDER', text: T(c, 'order_mock', { number: orderNumber }) };
    const lines = rows.map((r) => `• ${r.p.name} x ${r.qty} — ${money(r.p.price * r.qty)}`).join('\n');
    return { intent: 'SHOP_ORDER', text: T(c, 'order_created', { number: orderNumber, lines, price: money(subtotal), fee: shippingFee === 0 ? T(c, 'fee_free') : money(shippingFee), total: money(total), url }) };
  } catch (e: any) {
    console.error('[BOT] Order payment link failed:', e?.error?.description || e?.message || e);
    await db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', paymentStatus: 'FAILED' } }).catch(() => undefined);
    // Keep the confirm step so the customer can simply tap Confirm again.
    await writeState(c.conversationId, { ...state, at: Date.now() });
    return { intent: 'SHOP_ERROR', text: T(c, 'order_link_error') };
  }
}

/* ------------------------------------------------------------------ room booking request */

const MONTHS = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|अक्तूबर|अक्टूबर|नवंबर|दिसंबर|ਜਨਵਰੀ|ਫ਼ਰਵਰੀ|ਮਾਰਚ|ਅਪ੍ਰੈਲ|ਮਈ|ਜੂਨ|ਜੁਲਾਈ|ਅਗਸਤ|ਸਤੰਬਰ|ਅਕਤੂਬਰ|ਨਵੰਬਰ|ਦਸੰਬਰ|today|tomorrow|aaj|kal|parso|आज|कल|ਅੱਜ|ਕੱਲ/i;

async function handleRoom(c: Ctx, text: string, state: Extract<State, { step: 'ROOM' }>): Promise<BotReply> {
  const keep = (patch: Partial<Extract<State, { step: 'ROOM' }>>) => writeState(c.conversationId, { ...state, ...patch, at: Date.now() } as State);
  switch (state.stage) {
    case 'name': {
      const name = validateName(text);
      if (!name.ok) return { intent: 'ROOM', text: T(c, 'room_ask_name') };
      await keep({ stage: 'date', name: name.name });
      return { intent: 'ROOM', text: T(c, 'room_ask_date') };
    }
    case 'date': {
      const v = text.replace(/\s+/g, ' ').trim();
      if (v.length < 3 || v.length > 40 || !(/\d/.test(v) || MONTHS.test(v))) return { intent: 'ROOM', text: T(c, 'room_date_retry') };
      await keep({ stage: 'guests', checkIn: v });
      return { intent: 'ROOM', text: T(c, 'room_ask_guests') };
    }
    case 'guests': {
      const n = Number(text.match(/\d{1,3}/)?.[0]);
      if (!Number.isInteger(n) || n < 1 || n > 50) return { intent: 'ROOM', text: T(c, 'room_guests_retry') };
      await keep({ stage: 'nights', guests: n });
      return { intent: 'ROOM', text: T(c, 'room_ask_nights') };
    }
    case 'nights': {
      const n = Number(text.match(/\d{1,3}/)?.[0]);
      if (!Number.isInteger(n) || n < 1 || n > 60) return { intent: 'ROOM', text: T(c, 'room_nights_retry') };
      const user = await db.user.upsert({ where: { phone: c.phone }, update: {}, create: { phone: c.phone } });
      const reference = `RM-${Date.now()}-${randomInt(10000, 99999)}`;
      await db.roomBooking.create({ data: { reference, userId: user.id, name: state.name ?? user.name ?? '', phone: c.phone, guests: state.guests ?? 1, nights: n, checkIn: state.checkIn ?? '' } });
      await writeState(c.conversationId, null);
      return buttons('ROOM', T(c, 'room_done', { ref: reference, name: state.name ?? '', date: state.checkIn ?? '', guests: state.guests ?? 1, nights: n }), [{ id: 'menu:main', title: T(c, 'b_menu') }]);
    }
  }
}

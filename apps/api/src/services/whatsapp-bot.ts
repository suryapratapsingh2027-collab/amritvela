/**
 * Deterministic WhatsApp assistant for Amrit Vela Trust.
 *
 * Everything that touches money or records (donations, receipts, product orders, order status) is handled here
 * with explicit rules and live database / Razorpay data. Nothing in this file calls an LLM, so it cannot
 * invent prices, stock, payment states or confirmations. Only free-form Trust questions fall through to the
 * AI (see routes/webhooks.ts), and that path is grounded + guarded in services/ai.ts.
 *
 * Multi-step flows (checkout, donation) keep their state in Conversation.state (JSON) instead of guessing it
 * from the text of earlier messages, which is what caused wrong-product orders before.
 */
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { env } from '../config';
import { sendWhatsAppText, toWhatsAppImageUrl, type InteractiveSpec } from '../integrations/whatsapp';
import { createOrderPaymentLink } from '../integrations/razorpay';
import { createDonationLink } from './donation-payment-link';
import { reconcileDonation, reconcileOrder, sendReceiptPdf } from './payments';
import { sendOrderInvoice } from './fulfillment';
import { isSellable, money, shippingFor } from './pricing';
import { M } from '../i18n/messages';
import { DEFAULT_LANG, LANGS, LANG_TITLES, isLang, normalizeLang, t, type Lang, type MessageKey } from '../i18n';
import {
  MAX_DONATION, extractDonationRef, extractOrderRef, extractPin, findProducts, hasBuyIntent, hasCatalogIntent,
  hasDonationIntent, hasHumanIntent, hasPhotoIntent, hasPriceIntent, hasTrackIntent, isCancelOrMenu, isGreeting, isLanguageRequest, isMenuWord, isNo,
  isPaymentClaim, isReceiptRequest, isYes, parseAmount, parseExplicitQuantity, parseQuantity, validateAddress, validateName,
} from './bot-nlp';

const STATE_TTL_MS = 30 * 60 * 1000;

export type BotReply = { text: string; intent: string; image?: { url: string; caption: string }; interactive?: InteractiveSpec; after?: () => Promise<void> };
/** `replyId` is set when the customer tapped a list row / button (e.g. "menu:donate", "lang:pa", "prod:<id>", "cfm:yes"). */
export type RouteInput = { phone: string; text: string; conversationId: string; channel?: 'whatsapp' | 'web'; replyId?: string };
type Ctx = RouteInput & { lang: Lang; langChosen: boolean };

type State =
  | { step: 'AWAIT_PRODUCT'; at: number }
  | { step: 'AWAIT_NAME'; at: number; productId: string; quantity: number; address?: string; pin?: string }
  | { step: 'AWAIT_ADDRESS'; at: number; productId: string; quantity: number }
  | { step: 'AWAIT_CONFIRM'; at: number; productId: string; quantity: number; address: string; pin: string }
  | { step: 'AWAIT_DONATION_AMOUNT'; at: number }
  | { step: 'AWAIT_DONATION_NAME'; at: number; amount: number };

type ProductRow = { id: string; name: string; slug: string; price: number; stock: number; active: boolean; currency: string; imageUrl: string | null };

/** Translate in the customer's language; {support} is always available. */
const T = (c: Pick<Ctx, 'lang'>, key: MessageKey, vars: Record<string, string | number> = {}) => t(c.lang, key, { support: t(c.lang, 'support'), ...vars });

function productImage(p: ProductRow): BotReply['image'] {
  const url = toWhatsAppImageUrl(p.imageUrl);
  return url ? { url, caption: `${p.name} — ${money(p.price)}` } : undefined;
}

/* ------------------------------------------------------------------ state helpers */

async function readState(conversationId: string): Promise<State | null> {
  const c = await db.conversation.findUnique({ where: { id: conversationId }, select: { state: true } });
  const s = c?.state as State | null;
  if (!s || typeof s !== 'object' || !('step' in s)) return null;
  if (Date.now() - Number(s.at || 0) > STATE_TTL_MS) { await writeState(conversationId, null); return null; }
  return s;
}
async function writeState(conversationId: string, state: State | null) {
  await db.conversation.update({ where: { id: conversationId }, data: { state: state ? (state as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
}

async function loadProducts(): Promise<ProductRow[]> {
  const rows = await db.product.findMany({
    where: { active: true }, orderBy: { name: 'asc' }, take: 100,
    select: { id: true, name: true, slug: true, price: true, stock: true, active: true, currency: true, imageUrl: true },
  });
  return rows.filter(isSellable);
}

/* ------------------------------------------------------------------ menus (interactive messages) */

const list = (c: Ctx, intent: string, spec: Omit<Extract<InteractiveSpec, { kind: 'list' }>, 'kind'>): BotReply => ({ intent, text: spec.body, interactive: { kind: 'list', ...spec } });
const buttons = (intent: string, body: string, btns: { id: string; title: string }[]): BotReply => ({ intent, text: body, interactive: { kind: 'buttons', body, buttons: btns } });

function socialLinks(): string[] {
  const out: string[] = [];
  if (env.TRUST_YOUTUBE_URL) out.push(`▶️ YouTube: ${env.TRUST_YOUTUBE_URL}`);
  if (env.TRUST_FACEBOOK_URL) out.push(`📘 Facebook: ${env.TRUST_FACEBOOK_URL}`);
  if (env.TRUST_INSTAGRAM_URL) out.push(`📸 Instagram: ${env.TRUST_INSTAGRAM_URL}`);
  if (env.TRUST_WHATSAPP_COMMUNITY_URL) out.push(`💬 WhatsApp: ${env.TRUST_WHATSAPP_COMMUNITY_URL}`);
  return out;
}

/** First message of a new conversation: welcome + language list (shown in all scripts, since the language is not known yet). */
function languageMenu(c: Ctx): BotReply {
  return list(c, 'LANGUAGE', {
    header: 'Amrit Vela Trust', body: t('en', 'lang_welcome_body'), button: t('en', 'lang_button'),
    sections: [{ title: 'Language / भाषा', rows: LANGS.map((l) => ({ id: `lang:${l}`, title: LANG_TITLES[l] })) }],
  });
}

function mainMenu(c: Ctx, prefix?: string): BotReply {
  const trust = [
    { id: 'menu:info', title: T(c, 'm_info'), description: T(c, 'm_info_d') },
    { id: 'menu:donate', title: T(c, 'm_donate'), description: T(c, 'm_donate_d') },
    { id: 'menu:contact', title: T(c, 'm_contact') },
  ];
  if (socialLinks().length) trust.push({ id: 'menu:social', title: T(c, 'm_social') });
  return list(c, 'MENU', {
    body: `${prefix ? `${prefix}\n\n` : ''}${T(c, 'menu_body')}`, button: T(c, 'menu_button'),
    sections: [
      { title: T(c, 'sec_trust'), rows: trust },
      { title: T(c, 'sec_shop'), rows: [
        { id: 'menu:products', title: T(c, 'm_products'), description: T(c, 'm_products_d') },
        { id: 'menu:status', title: T(c, 'm_status') },
        { id: 'menu:receipt', title: T(c, 'm_receipt') },
      ] },
      { title: T(c, 'sec_help'), rows: [
        { id: 'menu:human', title: T(c, 'm_human') },
        { id: 'menu:lang', title: T(c, 'm_lang') },
      ] },
    ],
  });
}

const TOPICS = ['about', 'kirtan', 'dharamshala', 'medical', 'achievements', 'plans'] as const;
type Topic = (typeof TOPICS)[number];

function topicsMenu(c: Ctx): BotReply {
  return list(c, 'INFO', {
    body: T(c, 'info_body'), button: T(c, 'info_button'),
    sections: [{ title: T(c, 'info_section'), rows: TOPICS.map((k) => ({ id: `info:${k}`, title: T(c, `t_${k}` as MessageKey) })) }],
  });
}

function topicReply(c: Ctx, topic: Topic): BotReply {
  return buttons('INFO', `${T(c, `tx_${topic}` as MessageKey)}\n\n${T(c, 'after_topic')}`, [
    { id: 'menu:donate', title: T(c, 'b_donate') }, { id: 'menu:info', title: T(c, 'b_more') }, { id: 'menu:main', title: T(c, 'b_menu') },
  ]);
}

function contactReply(c: Ctx): BotReply {
  const social = socialLinks();
  return buttons('CONTACT', `${T(c, 'tx_contact')}${social.length ? `\n\n${social.join('\n')}` : ''}`, [
    { id: 'menu:donate', title: T(c, 'b_donate') }, { id: 'menu:info', title: T(c, 'b_more') }, { id: 'menu:main', title: T(c, 'b_menu') },
  ]);
}

function socialReply(c: Ctx): BotReply {
  const social = socialLinks();
  if (!social.length) return { intent: 'SOCIAL', text: T(c, 'social_none') };
  return buttons('SOCIAL', `${T(c, 'tx_social')}\n\n${social.join('\n')}`, [{ id: 'menu:main', title: T(c, 'b_menu') }]);
}

const DONATION_AMOUNTS = [101, 501, 1100, 2100, 5100];
function donationMenu(c: Ctx): BotReply {
  return list(c, 'DONATION_AMOUNT', {
    body: T(c, 'donate_body'), button: T(c, 'donate_button'),
    sections: [{ title: T(c, 'donate_section'), rows: [...DONATION_AMOUNTS.map((a) => ({ id: `amt:${a}`, title: `₹${a.toLocaleString('en-IN')}` })), { id: 'amt:other', title: T(c, 'amt_other') }] }],
  });
}

function productMenu(c: Ctx, products: ProductRow[]): BotReply {
  const available = products.filter((p) => p.stock > 0);
  if (!available.length) return { intent: 'SHOP', text: T(c, 'no_products') };
  return list(c, 'SHOP', {
    body: T(c, 'product_list_body'), button: T(c, 'product_list_button'), footer: T(c, 'product_footer', { name: available[0].name }),
    sections: [{ title: T(c, 'product_list_section'), rows: available.map((p) => ({ id: `prod:${p.id}`, title: p.name, description: money(p.price) })) }],
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

  if (isCancelOrMenu(text) || (inConfirm && isNo(text))) {
    const wasActive = Boolean(state);
    await writeState(c.conversationId, null);
    return wasActive ? { intent: 'CANCEL', text: T(c, 'cancelled_ok') } : mainMenu(c);
  }

  // Payment claims / receipt requests / explicit references. Never swallowed by a stale checkout state.
  const addressInProgress = state?.step === 'AWAIT_ADDRESS' && Boolean(extractPin(text));
  const confirmingAnswer = inConfirm && isYes(text);
  if (!addressInProgress && !confirmingAnswer) {
    const donRef = extractDonationRef(text);
    const ordRef = extractOrderRef(text);
    const purchaseVerb = /kharid|khareed|buy|purchase|chahiye|chaiye|lena|mangwa|खरीद|चाहिए|खरेदी|हवे|ਖਰੀਦ|ਚਾਹੀਦਾ/i.test(text);
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
        case 'info': await writeState(c.conversationId, null); return topicsMenu(c);
        case 'contact': await writeState(c.conversationId, null); return contactReply(c);
        case 'social': await writeState(c.conversationId, null); return socialReply(c);
        case 'lang': await writeState(c.conversationId, null); return languageMenu(c);
        case 'human': return humanReply(c);
        case 'donate': await writeState(c.conversationId, null); return donationMenu(c);
        case 'products': {
          await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now() });
          return productMenu(c, await loadProducts());
        }
        case 'status': return (await handlePaymentQuery(c, 'order status', { donRef: null, ordRef: null })) ?? { intent: 'PAYMENT_NONE', text: T(c, 'pay_none') };
        case 'receipt': return (await handlePaymentQuery(c, 'receipt', { donRef: null, ordRef: null })) ?? { intent: 'PAYMENT_NONE', text: T(c, 'pay_none') };
      }
      return null;
    }
    case 'info': {
      if (!(TOPICS as readonly string[]).includes(arg)) return null;
      await writeState(c.conversationId, null);
      return topicReply(c, arg as Topic);
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
      const product = (await loadProducts()).find((p) => p.id === arg);
      if (!product) return { intent: 'SHOP', text: T(c, 'product_not_found') };
      return startCheckout(c, product, 1);
    }
    case 'cfm': {
      const state = await readState(c.conversationId);
      if (state?.step !== 'AWAIT_CONFIRM') return mainMenu(c); // stale button from an expired session
      if (arg === 'yes') {
        const product = (await loadProducts()).find((p) => p.id === state.productId);
        if (!product) { await writeState(c.conversationId, null); return { intent: 'SHOP', text: T(c, 'product_not_found') }; }
        return placeOrder(c, state, product);
      }
      if (arg === 'addr') {
        await writeState(c.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), productId: state.productId, quantity: state.quantity });
        return { intent: 'SHOP', text: T(c, 'new_address') };
      }
      await writeState(c.conversationId, null);
      return { intent: 'CANCEL', text: T(c, 'cancelled_ok') };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ donations */

async function donationWithAmount(c: Ctx, amount: number): Promise<BotReply> {
  const user = await db.user.findUnique({ where: { phone: c.phone } });
  if (!user?.name) {
    await writeState(c.conversationId, { step: 'AWAIT_DONATION_NAME', at: Date.now(), amount });
    return { intent: 'DONATION_NAME', text: T(c, 'donate_ask_name', { amount: amount.toLocaleString('en-IN') }) };
  }
  return createDonationReply(c, amount);
}

async function handleDonationStart(c: Ctx, text: string, allowBare = false): Promise<BotReply> {
  const parsed = parseAmount(text, { allowBare });
  if (parsed.amount == null) {
    if (parsed.reason === 'decimal') return { intent: 'DONATION_AMOUNT', text: T(c, 'donate_decimal') };
    if (parsed.reason === 'range') return { intent: 'DONATION_AMOUNT', text: T(c, 'donate_range', { max: MAX_DONATION.toLocaleString('en-IN') }) };
    // No amount typed: offer the quick-amount list (customers can still type any amount).
    await writeState(c.conversationId, { step: 'AWAIT_DONATION_AMOUNT', at: Date.now() });
    return donationMenu(c);
  }
  return donationWithAmount(c, parsed.amount);
}

async function createDonationReply(c: Ctx, amount: number): Promise<BotReply> {
  await writeState(c.conversationId, null);
  try {
    const user = await db.user.findUnique({ where: { phone: c.phone } });
    const result = await createDonationLink({ phone: c.phone, name: user?.name, email: user?.email, amount, lang: c.lang });
    if (result.mock) return { intent: 'DONATION', text: T(c, 'donate_mock', { ref: result.reference }) };
    return { intent: 'DONATION', text: result.message };
  } catch (e: any) {
    console.error('[BOT] Donation link creation failed:', e?.error?.description || e?.message || e);
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

/* ------------------------------------------------------------------ shop (stateless entry) */

async function handleShop(c: Ctx, text: string): Promise<BotReply | null> {
  const products = await loadProducts();
  const { wanted, negated, spans } = findProducts(text, products);

  if (wanted.length > 1) return { intent: 'SHOP', text: T(c, 'shop_multi', { names: wanted.map((p) => p.name).join(', ') }) };
  if (wanted.length === 1) {
    const p = wanted[0];
    if (hasPhotoIntent(text) && !hasBuyIntent(text)) {
      const image = productImage(p);
      const hint = p.stock > 0 ? ` ${T(c, 'order_hint', { name: p.name })}` : '';
      return { intent: 'SHOP', image, text: image ? `${stockHint(c, p)}${hint}` : `${T(c, 'photo_none', { name: p.name })} ${stockHint(c, p)}${hint}` };
    }
    if (hasBuyIntent(text)) return startCheckout(c, p, parseQuantity(text, spans.get(p.id)));
    if (hasPriceIntent(text)) return { intent: 'SHOP', image: productImage(p), text: `${stockHint(c, p)}${p.stock > 0 ? ` ${T(c, 'order_hint', { name: p.name })}` : ''}` };
    // Just the product name on its own means "I want this".
    if (normalizeBare(text) === normalizeBare(p.name)) return startCheckout(c, p, 1);
    return null;
  }
  if (negated.length && hasBuyIntent(text)) {
    await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now() });
    return productMenu(c, products);
  }
  if (hasCatalogIntent(text) || (hasBuyIntent(text) && /order|kharid|khareed|buy|purchase|चाहिए|खरीद|ऑर्डर|खरेदी|ਖਰੀਦ|ਆਰਡਰ|product|saman/i.test(text) && !hasDonationIntent(text))) {
    await writeState(c.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now() });
    return productMenu(c, products);
  }
  return null;
}

const normalizeBare = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\u0a00-\u0a7f]+/g, '');

async function startCheckout(c: Ctx, p: ProductRow, quantity: number, keep?: { address: string; pin: string }): Promise<BotReply> {
  if (p.stock < 1) return { intent: 'SHOP', text: T(c, 'out_of_stock', { name: p.name }) };
  if (quantity > p.stock) return { intent: 'SHOP', text: T(c, 'qty_too_many', { name: p.name }) };
  const user = await db.user.findUnique({ where: { phone: c.phone } });
  if (!user?.name) {
    await writeState(c.conversationId, { step: 'AWAIT_NAME', at: Date.now(), productId: p.id, quantity, ...(keep || {}) });
    return { intent: 'SHOP', image: productImage(p), text: T(c, 'ask_name_product', { name: p.name, qty: quantity, price: money(p.price) }) };
  }
  if (keep) return confirmationReply(c, p, quantity, user.name, keep.address, keep.pin);
  await writeState(c.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), productId: p.id, quantity });
  const subtotal = p.price * quantity;
  const fee = shippingFor(subtotal);
  return { intent: 'SHOP', image: productImage(p), text: T(c, 'ask_address', { name: p.name, qty: quantity, subtotal: money(subtotal), fee: fee === 0 ? T(c, 'fee_free') : money(fee) }) };
}

async function confirmationReply(c: Ctx, p: ProductRow, quantity: number, name: string, address: string, pin: string): Promise<BotReply> {
  await writeState(c.conversationId, { step: 'AWAIT_CONFIRM', at: Date.now(), productId: p.id, quantity, address, pin });
  const subtotal = p.price * quantity;
  const fee = shippingFor(subtotal);
  const body = T(c, 'confirm_summary', { product: p.name, qty: quantity, price: money(subtotal), fee: money(fee), total: money(subtotal + fee), name, address });
  return { ...buttons('SHOP_CONFIRM', body, [
    { id: 'cfm:yes', title: T(c, 'b_confirm') }, { id: 'cfm:addr', title: T(c, 'b_address') }, { id: 'cfm:no', title: T(c, 'b_cancel') },
  ]) };
}

/* ------------------------------------------------------------------ state machine */

async function handleState(c: Ctx, text: string, state: State): Promise<BotReply | null> {
  const products = state.step.startsWith('AWAIT_DONATION') ? [] : await loadProducts();
  const stateProduct = 'productId' in state ? products.find((p) => p.id === state.productId) : undefined;

  switch (state.step) {
    case 'AWAIT_DONATION_AMOUNT': {
      const parsed = parseAmount(text, { allowBare: true });
      if (parsed.amount != null) return donationWithAmount(c, parsed.amount);
      if (parsed.reason === 'decimal' || parsed.reason === 'range') return handleDonationStart(c, text, true);
      // A product message while waiting for an amount: leave donation mode.
      if (findProducts(text, await loadProducts()).wanted.length || hasBuyIntent(text) || hasCatalogIntent(text)) { await writeState(c.conversationId, null); return null; }
      return { intent: 'DONATION_AMOUNT', text: T(c, 'donate_amount_retry') };
    }

    case 'AWAIT_DONATION_NAME': {
      const name = validateName(text);
      if (!name.ok) return { intent: 'DONATION_NAME', text: T(c, 'donate_name_retry') };
      await db.user.update({ where: { phone: c.phone }, data: { name: name.name } });
      return createDonationReply(c, state.amount);
    }

    case 'AWAIT_PRODUCT': {
      const { wanted, spans } = findProducts(text, products);
      if (wanted.length > 1) return { intent: 'SHOP', text: T(c, 'shop_multi', { names: wanted.map((p) => p.name).join(', ') }) };
      if (wanted.length === 1) return startCheckout(c, wanted[0], parseQuantity(text, spans.get(wanted[0].id)));
      if (hasDonationIntent(text)) { await writeState(c.conversationId, null); return null; }
      const menu = productMenu(c, products);
      return { ...menu, text: `${T(c, 'product_not_found')}\n\n${menu.text}`, interactive: menu.interactive && menu.interactive.kind === 'list' ? { ...menu.interactive, body: `${T(c, 'product_not_found')}\n\n${menu.interactive.body}` } : menu.interactive };
    }

    case 'AWAIT_NAME':
    case 'AWAIT_ADDRESS':
    case 'AWAIT_CONFIRM': {
      if (!stateProduct || stateProduct.stock < 1) {
        await writeState(c.conversationId, null);
        const menu = productMenu(c, products);
        const gone = T(c, 'product_gone', { name: stateProduct?.name || '' }).trim();
        return { ...menu, text: `${gone}\n\n${menu.text}`, interactive: menu.interactive && menu.interactive.kind === 'list' ? { ...menu.interactive, body: `${gone}\n\n${menu.interactive.body}` } : menu.interactive };
      }
      const { wanted, spans } = findProducts(text, products);
      const pin = extractPin(text);

      // Customer changes their mind about the product mid-checkout ("order Nariyal").
      if (wanted.length > 1) return { intent: 'SHOP', text: T(c, 'shop_multi', { names: wanted.map((p) => p.name).join(', ') }) };
      if (wanted.length === 1 && (wanted[0].id !== state.productId || !pin)) {
        const keep = state.step === 'AWAIT_CONFIRM' ? { address: state.address, pin: state.pin } : state.step === 'AWAIT_NAME' && state.address ? { address: state.address, pin: state.pin! } : undefined;
        return startCheckout(c, wanted[0], parseQuantity(text, spans.get(wanted[0].id)), keep);
      }

      if (state.step === 'AWAIT_NAME') {
        const name = validateName(text);
        if (!name.ok) return { intent: 'SHOP', text: T(c, 'name_retry') };
        await db.user.update({ where: { phone: c.phone }, data: { name: name.name } });
        if (state.address && state.pin) return confirmationReply(c, stateProduct, state.quantity, name.name, state.address, state.pin);
        await writeState(c.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), productId: state.productId, quantity: state.quantity });
        return { intent: 'SHOP', text: T(c, 'name_then_address') };
      }

      const qty = parseExplicitQuantity(text);
      if (qty != null) {
        if (qty > stateProduct.stock) return { intent: 'SHOP', text: T(c, 'qty_too_many', { name: stateProduct.name }) };
        if (state.step === 'AWAIT_CONFIRM') {
          const u = await db.user.findUnique({ where: { phone: c.phone } });
          return confirmationReply(c, stateProduct, qty, u?.name || T(c, 'customer_default'), state.address, state.pin);
        }
        await writeState(c.conversationId, { ...state, quantity: qty, at: Date.now() });
        return { intent: 'SHOP', text: T(c, 'qty_set', { qty }) };
      }

      if (state.step === 'AWAIT_CONFIRM' && isYes(text)) return placeOrder(c, state, stateProduct);
      if (state.step === 'AWAIT_CONFIRM' && /address|pata|badal|change|पता|पत्ता|ਪਤਾ|बदल|ਬਦਲ/i.test(text) && !pin) {
        await writeState(c.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), productId: state.productId, quantity: state.quantity });
        return { intent: 'SHOP', text: T(c, 'new_address') };
      }

      const check = validateAddress(text);
      if (!check.ok) {
        if (state.step === 'AWAIT_CONFIRM') return { intent: 'SHOP', text: T(c, 'confirm_hint') };
        return { intent: 'SHOP', text: T(c, check.reason) };
      }
      const u = await db.user.findUnique({ where: { phone: c.phone } });
      if (!u?.name) {
        await writeState(c.conversationId, { step: 'AWAIT_NAME', at: Date.now(), productId: state.productId, quantity: state.quantity, address: check.address, pin: check.pin });
        return { intent: 'SHOP', text: T(c, 'address_then_name') };
      }
      return confirmationReply(c, stateProduct, state.quantity, u.name, check.address, check.pin);
    }
  }
}

async function placeOrder(c: Ctx, state: Extract<State, { step: 'AWAIT_CONFIRM' }>, p: ProductRow): Promise<BotReply> {
  const fresh = await db.product.findUnique({ where: { id: p.id } });
  if (!fresh || !isSellable(fresh) || fresh.stock < state.quantity) {
    await writeState(c.conversationId, null);
    return { intent: 'SHOP', text: T(c, 'place_unavailable', { name: p.name, qty: state.quantity }) };
  }
  const user = await db.user.findUnique({ where: { phone: c.phone } });
  if (!user) return { intent: 'SHOP', text: T(c, 'profile_missing') };

  const subtotal = fresh.price * state.quantity;
  const shippingFee = shippingFor(subtotal);
  const total = subtotal + shippingFee;
  const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

  const order = await db.order.create({
    data: {
      orderNumber, userId: user.id, subtotal, shippingFee, total,
      address: { full: state.address, pin: state.pin },
      items: { create: [{ productId: fresh.id, quantity: state.quantity, unitPrice: fresh.price }] },
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
    return {
      intent: 'SHOP_ORDER',
      text: T(c, 'order_created', { number: orderNumber, product: fresh.name, qty: state.quantity, price: money(subtotal), fee: money(shippingFee), total: money(total), url }),
    };
  } catch (e: any) {
    console.error('[BOT] Order payment link failed:', e?.error?.description || e?.message || e);
    await db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', paymentStatus: 'FAILED' } }).catch(() => undefined);
    // Keep the confirm step so the customer can simply tap Confirm again.
    await writeState(c.conversationId, { ...state, at: Date.now() });
    return { intent: 'SHOP_ERROR', text: T(c, 'order_link_error') };
  }
}

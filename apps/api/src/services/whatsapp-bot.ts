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
import { sendWhatsAppText, toWhatsAppImageUrl } from '../integrations/whatsapp';
import { createOrderPaymentLink } from '../integrations/razorpay';
import { createDonationLink } from './donation-payment-link';
import { reconcileDonation, reconcileOrder, sendReceiptPdf } from './payments';
import { sendOrderInvoice } from './fulfillment';
import { isSellable, money, shippingFor } from './pricing';
import {
  MAX_DONATION, extractDonationRef, extractOrderRef, extractPin, findProducts, hasBuyIntent, hasCatalogIntent,
  hasDonationIntent, hasHumanIntent, hasPhotoIntent, hasPriceIntent, hasTrackIntent, isCancelOrMenu, isGreeting, isNo,
  isPaymentClaim, isReceiptRequest, isYes, parseAmount, parseExplicitQuantity, parseQuantity, validateAddress, validateName,
} from './bot-nlp';

const SUPPORT = 'Agar dikkat aaye to Trust team se 6913001300 par sampark karein.';
const STATE_TTL_MS = 30 * 60 * 1000;

export type BotReply = { text: string; intent: string; image?: { url: string; caption: string }; after?: () => Promise<void> };
type Ctx = { phone: string; text: string; conversationId: string };

type State =
  | { step: 'AWAIT_PRODUCT'; at: number }
  | { step: 'AWAIT_NAME'; at: number; productId: string; quantity: number; address?: string; pin?: string }
  | { step: 'AWAIT_ADDRESS'; at: number; productId: string; quantity: number }
  | { step: 'AWAIT_CONFIRM'; at: number; productId: string; quantity: number; address: string; pin: string }
  | { step: 'AWAIT_DONATION_AMOUNT'; at: number }
  | { step: 'AWAIT_DONATION_NAME'; at: number; amount: number };

type ProductRow = { id: string; name: string; slug: string; price: number; stock: number; active: boolean; currency: string; imageUrl: string | null };

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

/* ------------------------------------------------------------------ canned texts */

const MENU = 'Namaste! Amrit Vela Trust mein aapka swagat hai. 🙏\n\nMain in cheezon mein madad kar sakta hoon:\n• Donation — likhein "Donation 500"\n• Product order — likhein "Nariyal kharidna hai" ya "products"\n• Donation receipt — likhein "receipt"\n• Order status — apna order number (ORD-...) bhejein\n• Trust ke baare mein koi bhi sawaal\n\nKisi insaan se baat karni ho to "human" likhein.';

function productList(products: ProductRow[]): string {
  if (!products.length) return `Abhi koi product order ke liye available nahi hai. ${SUPPORT}`;
  return 'Aap kaunsa product order karna chahte hain?\n' +
    products.map((p) => `• ${p.name} — ${money(p.price)} — ${p.stock > 0 ? `${p.stock} available` : 'Out of stock'}`).join('\n') +
    '\n\nProduct ka naam bhejein, jaise "' + (products.find((p) => p.stock > 0)?.name || products[0].name) + '". Kisi product ki photo ke liye "' + products[0].name + ' photo" likhein. Cancel karne ke liye "cancel" likhein.';
}

const ORDER_STATUS_TEXT: Record<string, string> = {
  PENDING_PAYMENT: 'Payment ka intezaar', CONFIRMED: 'Confirm (payment mil gaya)', PROCESSING: 'Taiyaar ho raha hai',
  SHIPPED: 'Ship ho chuka hai', OUT_FOR_DELIVERY: 'Delivery ke liye nikla hai', DELIVERED: 'Deliver ho chuka hai', CANCELLED: 'Cancel',
};

/* ------------------------------------------------------------------ main router */

/**
 * Returns a reply for transactional/known intents, or null when the message should go to the grounded AI.
 */
export async function routeWhatsAppMessage(ctx: Ctx): Promise<BotReply | null> {
  const text = ctx.text.trim();
  const state = await readState(ctx.conversationId);
  const inConfirm = state?.step === 'AWAIT_CONFIRM';

  if (hasHumanIntent(text)) {
    await writeState(ctx.conversationId, null);
    return { intent: 'HUMAN', text: 'Aapki request Trust team ko note kar li gayi hai. Team jaldi aapse sampark karegi. Aap seedha 6913001300 ya amritvelatrustlive@gmail.com par bhi sampark kar sakte hain.\n\nBot par wapas aane ke liye "menu" likhein.' };
  }

  if (isCancelOrMenu(text) || (inConfirm && isNo(text))) {
    const wasActive = Boolean(state);
    await writeState(ctx.conversationId, null);
    if (/^(menu|start|start over|reset)$/i.test(text.toLowerCase().trim())) return { intent: 'MENU', text: MENU };
    return { intent: 'CANCEL', text: wasActive ? 'Theek hai, maine ye process cancel kar diya hai. Kuch aur chahiye to "menu" likhein.' : MENU };
  }

  if (isGreeting(text)) {
    await writeState(ctx.conversationId, null);
    return { intent: 'GREETING', text: MENU };
  }

  // Payment claims / receipt requests / explicit references. Never swallowed by a stale checkout state.
  const addressInProgress = state?.step === 'AWAIT_ADDRESS' && Boolean(extractPin(text));
  const confirmingAnswer = inConfirm && isYes(text);
  if (!addressInProgress && !confirmingAnswer) {
    const donRef = extractDonationRef(text);
    const ordRef = extractOrderRef(text);
    const purchaseVerb = /kharid|khareed|buy|purchase|chahiye|chaiye|lena|mangwa|खरीद|चाहिए/i.test(text);
    if (isReceiptRequest(text) || isPaymentClaim(text) || donRef || ordRef || (hasTrackIntent(text) && !purchaseVerb)) {
      const reply = await handlePaymentQuery(ctx, text, { donRef, ordRef });
      if (reply) return reply;
    }
  }

  if (state) {
    const reply = await handleState(ctx, text, state);
    if (reply) return reply;
  }

  if (hasDonationIntent(text)) return handleDonationStart(ctx, text);

  return handleShop(ctx, text);
}

/* ------------------------------------------------------------------ donations */

async function handleDonationStart(ctx: Ctx, text: string, allowBare = false): Promise<BotReply> {
  const parsed = parseAmount(text, { allowBare });
  if (parsed.amount == null) {
    if (parsed.reason === 'decimal') return { intent: 'DONATION_AMOUNT', text: 'Kripya poore rupaye mein amount bhejein, jaise ₹500.' };
    if (parsed.reason === 'range') return { intent: 'DONATION_AMOUNT', text: `Donation amount ₹1 se ₹${MAX_DONATION.toLocaleString('en-IN')} ke beech hona chahiye. Kripya sahi amount bhejein.` };
    await writeState(ctx.conversationId, { step: 'AWAIT_DONATION_AMOUNT', at: Date.now() });
    return { intent: 'DONATION_AMOUNT', text: 'Amrit Vela Trust ko donation dene ke liye kitni rakam donate karna chahte hain? Kripya amount bhejein, jaise ₹500.' };
  }
  const user = await db.user.findUnique({ where: { phone: ctx.phone } });
  if (!user?.name) {
    await writeState(ctx.conversationId, { step: 'AWAIT_DONATION_NAME', at: Date.now(), amount: parsed.amount });
    return { intent: 'DONATION_NAME', text: `₹${parsed.amount.toLocaleString('en-IN')} donation ke liye dhanyavaad! Receipt par naam likhne ke liye apna poora naam bhejein.` };
  }
  return createDonationReply(ctx, parsed.amount);
}

async function createDonationReply(ctx: Ctx, amount: number): Promise<BotReply> {
  await writeState(ctx.conversationId, null);
  try {
    const user = await db.user.findUnique({ where: { phone: ctx.phone } });
    const result = await createDonationLink({ phone: ctx.phone, name: user?.name, email: user?.email, amount });
    if (result.mock) {
      return { intent: 'DONATION', text: `Donation ${result.reference} ka demo record bana hai, lekin MOCK_PROVIDERS enabled hai. Yeh real payment link nahi hai, payment na karein.` };
    }
    return { intent: 'DONATION', text: result.message };
  } catch (e: any) {
    console.error('[BOT] Donation link creation failed:', e?.error?.description || e?.message || e);
    return { intent: 'DONATION_ERROR', text: `Abhi payment link nahi ban saka, isliye koi payment na karein. Kripya thodi der baad dobara try karein. ${SUPPORT}` };
  }
}

/* ------------------------------------------------------------------ payment status / receipts */

async function handlePaymentQuery(ctx: Ctx, text: string, refs: { donRef: string | null; ordRef: string | null }): Promise<BotReply | null> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let donation = null as Awaited<ReturnType<typeof db.donation.findFirst>>;
  let order = null as Awaited<ReturnType<typeof db.order.findFirst>>;

  if (refs.donRef) {
    donation = await db.donation.findFirst({ where: { reference: refs.donRef, user: { phone: ctx.phone } } });
    if (!donation) return { intent: 'DONATION_STATUS', text: `Is WhatsApp number se ${refs.donRef} reference ka donation record nahi mila. Reference dobara check karein ya ${SUPPORT}` };
  } else if (refs.ordRef) {
    order = await db.order.findFirst({ where: { orderNumber: refs.ordRef, user: { phone: ctx.phone } } });
    if (!order) return { intent: 'ORDER_STATUS', text: `Is WhatsApp number se ${refs.ordRef} order nahi mila. Order number dobara check karein ya ${SUPPORT}` };
  } else {
    const [d, o] = await Promise.all([
      db.donation.findFirst({ where: { user: { phone: ctx.phone }, createdAt: { gte: since }, paymentStatus: { not: 'FAILED' } }, orderBy: { createdAt: 'desc' } })
        .then((x) => x ?? db.donation.findFirst({ where: { user: { phone: ctx.phone }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } })),
      db.order.findFirst({ where: { user: { phone: ctx.phone }, createdAt: { gte: since }, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } }),
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
      return { intent: 'PAYMENT_NONE', text: `Mujhe is WhatsApp number se judi koi recent donation ya order entry nahi mili. Agar aapne donation ya order kiya hai to uska reference number (DON-... / ORD-...) bhejein. ${SUPPORT}` };
    }
  }

  if (donation) return donationStatusReply(donation.id);
  if (order) return orderStatusReply(order.id, /invoice|receipt|bill|रसीद/i.test(text));
  return null;
}

async function donationStatusReply(donationId: string): Promise<BotReply> {
  let rec;
  try { rec = await reconcileDonation(donationId); } catch (e: any) { console.error('[BOT] reconcileDonation failed:', e?.message || e); }
  const d = await db.donation.findUnique({ where: { id: donationId }, include: { user: true } });
  if (!d) return { intent: 'DONATION_STATUS', text: 'Donation record nahi mila.' };

  if (d.paymentStatus === 'PAID') {
    const lead = rec?.justPaid
      ? `Razorpay se aapka ₹${d.amount.toLocaleString('en-IN')} ka payment verify ho gaya hai. 🙏`
      : `Aapka ₹${d.amount.toLocaleString('en-IN')} ka donation verified hai. 🙏`;
    return {
      intent: 'DONATION_RECEIPT',
      text: `${lead}\nReference: ${d.reference}\nDhanyavaad! PDF receipt bhej raha hoon.`,
      after: async () => {
        try { await sendReceiptPdf(d.id); }
        catch (e: any) {
          console.error('[BOT] Receipt PDF send failed:', e?.message || e);
          await sendWhatsAppText(d.user.phone, `Receipt PDF bhejne mein dikkat aayi. Aap yahan se download kar sakte hain:\n${env.API_URL}/api/donations/${d.id}/receipt\n\n${SUPPORT}`);
        }
      },
    };
  }

  const ref = `${d.reference} (₹${d.amount.toLocaleString('en-IN')})`;
  if (!rec || rec.unverified) {
    return { intent: 'DONATION_STATUS', text: `Donation ${ref} abhi hamare record mein ${d.paymentStatus} hai aur main Razorpay se is payment ko abhi verify nahi kar paaya. Kripya dobara payment na karein. 2-3 minute baad "receipt" likhein, ya ${SUPPORT}` };
  }
  if (rec.status === 'EXPIRED' || rec.status === 'CANCELLED') {
    return { intent: 'DONATION_STATUS', text: `Donation ${ref} ka payment link ${rec.status === 'EXPIRED' ? 'expire' : 'cancel'} ho chuka hai aur koi payment receive nahi hua. Naya donation shuru karne ke liye "Donation 500" jaise amount ke saath likhein.` };
  }
  return { intent: 'DONATION_STATUS', text: `Razorpay par donation ${ref} ka payment abhi tak receive nahi hua hai. Agar aapne abhi payment kiya hai to 1-2 minute baad "receipt" likhein. Payment na hua ho to naya link ke liye "Donation 500" jaise amount ke saath likhein. Dobara payment tabhi karein jab pehla payment fail dikhe.` };
}

async function orderStatusReply(orderId: string, wantsInvoice: boolean): Promise<BotReply> {
  let rec;
  try { rec = await reconcileOrder(orderId); } catch (e: any) { console.error('[BOT] reconcileOrder failed:', e?.message || e); }
  const o = await db.order.findUnique({ where: { id: orderId }, include: { user: true, items: { include: { product: true } } } });
  if (!o) return { intent: 'ORDER_STATUS', text: 'Order record nahi mila.' };

  const items = o.items.map((i) => `${i.product.name} x ${i.quantity}`).join(', ');
  const base = `Order ${o.orderNumber}\nItems: ${items}\nTotal: ${money(o.total)}`;

  if (o.paymentStatus !== 'PAID') {
    if (!rec || rec.unverified) return { intent: 'ORDER_STATUS', text: `${base}\nPayment status: ${o.paymentStatus}\n\nMain Razorpay se is payment ko abhi verify nahi kar paaya. Dobara payment na karein; 2-3 minute baad order number bhejkar status poochein, ya ${SUPPORT}` };
    if (rec.status === 'EXPIRED' || rec.status === 'CANCELLED') return { intent: 'ORDER_STATUS', text: `${base}\nIs order ka payment link ${rec.status === 'EXPIRED' ? 'expire' : 'cancel'} ho gaya hai. Naya order karne ke liye product ka naam bhejein.` };
    return { intent: 'ORDER_STATUS', text: `${base}\nPayment: abhi receive nahi hua (Razorpay par pending). Payment complete karne ke baad order confirm hoga.` };
  }

  const lines = [base, `Payment: verified ✅`, `Status: ${ORDER_STATUS_TEXT[o.status] || o.status}`];
  if (o.courier) lines.push(`Courier: ${o.courier}`);
  if (o.awb) lines.push(`AWB: ${o.awb}`);
  if (o.trackingUrl) lines.push(`Tracking: ${o.trackingUrl}`);
  if (!o.awb && ['CONFIRMED', 'PROCESSING'].includes(o.status)) lines.push('Dispatch hone par tracking details yahin share ki jayengi.');
  if (rec?.justPaid) lines.push('\nAapka payment abhi verify hua hai; confirmation aur invoice bheji ja rahi hai.');
  return {
    intent: 'ORDER_STATUS',
    text: lines.join('\n'),
    after: wantsInvoice && !rec?.justPaid ? async () => { await sendOrderInvoice(o.id).catch(async (e) => { console.error('[BOT] Invoice send failed:', e?.message || e); await sendWhatsAppText(o.user.phone, `Invoice bhejne mein dikkat aayi. ${SUPPORT}`); }); } : undefined,
  };
}

/* ------------------------------------------------------------------ shop (stateless entry) */

async function handleShop(ctx: Ctx, text: string): Promise<BotReply | null> {
  const products = await loadProducts();
  const { wanted, negated, spans } = findProducts(text, products);

  if (wanted.length > 1) {
    return { intent: 'SHOP', text: `Aapne ek se zyada products likhe hain (${wanted.map((p) => p.name).join(', ')}). Ek baar mein ek product order hota hai. Pehle kaunsa order karna hai?` };
  }
  if (wanted.length === 1) {
    const p = wanted[0];
    if (hasPhotoIntent(text) && !hasBuyIntent(text)) {
      const image = productImage(p);
      return {
        intent: 'SHOP', image,
        text: image
          ? `${p.name} — ${money(p.price)} (${p.stock > 0 ? `${p.stock} available` : 'Out of stock'}). Order karne ke liye "${p.name} kharidna hai" likhein.`
          : `${p.name} ki photo abhi available nahi hai. Price: ${money(p.price)} (${p.stock > 0 ? `${p.stock} available` : 'Out of stock'}). Order karne ke liye "${p.name} kharidna hai" likhein.`,
      };
    }
    if (hasBuyIntent(text)) return startCheckout(ctx, p, parseQuantity(text, spans.get(p.id)));
    if (hasPriceIntent(text)) {
      return { intent: 'SHOP', image: productImage(p), text: `${p.name} — ${money(p.price)} (${p.stock > 0 ? `${p.stock} available` : 'Out of stock'}). Order karne ke liye "${p.name} kharidna hai" likhein.` };
    }
    // Just the product name on its own means "I want this".
    if (normalizeBare(text) === normalizeBare(p.name)) return startCheckout(ctx, p, 1);
    return null;
  }
  if (negated.length && hasBuyIntent(text)) {
    await writeState(ctx.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now() });
    return { intent: 'SHOP', text: productList(products) };
  }
  if (hasCatalogIntent(text) || (hasBuyIntent(text) && /order|kharid|khareed|buy|purchase|चाहिए|खरीद|ऑर्डर|product|saman/i.test(text) && !hasDonationIntent(text))) {
    await writeState(ctx.conversationId, { step: 'AWAIT_PRODUCT', at: Date.now() });
    return { intent: 'SHOP', text: productList(products) };
  }
  return null;
}

const normalizeBare = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, '');

async function startCheckout(ctx: Ctx, p: ProductRow, quantity: number, keep?: { address: string; pin: string }): Promise<BotReply> {
  if (p.stock < 1) {
    return { intent: 'SHOP', text: `${p.name} abhi out of stock hai. Koi doosra product choose karein ya "products" likhein.` };
  }
  if (quantity > p.stock) {
    return { intent: 'SHOP', text: `${p.name} ka sirf ${p.stock} stock available hai. Kripya ${p.stock} ya usse kam quantity bhejein, jaise "${p.stock} ${p.name}".` };
  }
  const user = await db.user.findUnique({ where: { phone: ctx.phone } });
  if (!user?.name) {
    await writeState(ctx.conversationId, { step: 'AWAIT_NAME', at: Date.now(), productId: p.id, quantity, ...(keep || {}) });
    return { intent: 'SHOP', image: productImage(p), text: `Aapne ${p.name} x ${quantity} choose kiya hai (${money(p.price)} each). Delivery ke liye apna poora naam bhejein.` };
  }
  if (keep) return confirmationReply(ctx, p, quantity, user.name, keep.address, keep.pin);
  await writeState(ctx.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), productId: p.id, quantity });
  const subtotal = p.price * quantity;
  const fee = shippingFor(subtotal);
  return { intent: 'SHOP', image: productImage(p), text: `${p.name} x ${quantity} — ${money(subtotal)}.\nDelivery ke liye apna poora address, area/city, state aur 6-digit PIN code ek message mein bhejein.\nDelivery charge: ${fee === 0 ? 'free' : money(fee)}.` };
}

async function confirmationReply(ctx: Ctx, p: ProductRow, quantity: number, name: string, address: string, pin: string): Promise<BotReply> {
  await writeState(ctx.conversationId, { step: 'AWAIT_CONFIRM', at: Date.now(), productId: p.id, quantity, address, pin });
  const subtotal = p.price * quantity;
  const fee = shippingFor(subtotal);
  return {
    intent: 'SHOP_CONFIRM',
    text: `Kripya apna order check karein:\n\nProduct: ${p.name} x ${quantity}\nProduct price: ${money(subtotal)}\nDelivery: ${money(fee)}\nTotal: ${money(subtotal + fee)}\n\nNaam: ${name}\nAddress: ${address}\n\nSab sahi hai to "haan" likhein. Address badalna ho to naya address bhejein. Cancel ke liye "cancel".`,
  };
}

/* ------------------------------------------------------------------ state machine */

async function handleState(ctx: Ctx, text: string, state: State): Promise<BotReply | null> {
  const products = state.step.startsWith('AWAIT_DONATION') ? [] : await loadProducts();
  const stateProduct = 'productId' in state ? products.find((p) => p.id === state.productId) : undefined;

  switch (state.step) {
    case 'AWAIT_DONATION_AMOUNT': {
      const parsed = parseAmount(text, { allowBare: true });
      if (parsed.amount != null) {
        const user = await db.user.findUnique({ where: { phone: ctx.phone } });
        if (!user?.name) {
          await writeState(ctx.conversationId, { step: 'AWAIT_DONATION_NAME', at: Date.now(), amount: parsed.amount });
          return { intent: 'DONATION_NAME', text: `₹${parsed.amount.toLocaleString('en-IN')} donation ke liye dhanyavaad! Receipt par naam likhne ke liye apna poora naam bhejein.` };
        }
        return createDonationReply(ctx, parsed.amount);
      }
      if (parsed.reason === 'decimal' || parsed.reason === 'range') return handleDonationStart(ctx, text, true);
      // A product message while waiting for an amount: leave donation mode.
      if (findProducts(text, await loadProducts()).wanted.length || hasBuyIntent(text) || hasCatalogIntent(text)) { await writeState(ctx.conversationId, null); return null; }
      return { intent: 'DONATION_AMOUNT', text: 'Kripya donation amount number mein bhejein, jaise ₹500. Cancel karne ke liye "cancel" likhein.' };
    }

    case 'AWAIT_DONATION_NAME': {
      const name = validateName(text);
      if (!name.ok) return { intent: 'DONATION_NAME', text: 'Kripya receipt ke liye apna poora naam bhejein (sirf naam, number ke bina). Cancel ke liye "cancel".' };
      await db.user.update({ where: { phone: ctx.phone }, data: { name: name.name } });
      return createDonationReply(ctx, state.amount);
    }

    case 'AWAIT_PRODUCT': {
      const { wanted, spans } = findProducts(text, products);
      if (wanted.length > 1) return { intent: 'SHOP', text: `Aapne ek se zyada products likhe hain (${wanted.map((p) => p.name).join(', ')}). Kripya ek product ka naam bhejein.` };
      if (wanted.length === 1) return startCheckout(ctx, wanted[0], parseQuantity(text, spans.get(wanted[0].id)));
      if (hasDonationIntent(text)) { await writeState(ctx.conversationId, null); return null; }
      return { intent: 'SHOP', text: `Mujhe is naam ka koi product nahi mila.\n\n${productList(products)}` };
    }

    case 'AWAIT_NAME':
    case 'AWAIT_ADDRESS':
    case 'AWAIT_CONFIRM': {
      if (!stateProduct || stateProduct.stock < 1) {
        await writeState(ctx.conversationId, null);
        return { intent: 'SHOP', text: `${stateProduct?.name || 'Yeh product'} ab available nahi hai.\n\n${productList(products)}` };
      }
      const { wanted, spans } = findProducts(text, products);
      const pin = extractPin(text);

      // Customer changes their mind about the product mid-checkout ("Nariyal order karna h").
      if (wanted.length > 1) return { intent: 'SHOP', text: `Aapne ek se zyada products likhe hain (${wanted.map((p) => p.name).join(', ')}). Ek baar mein ek product order hota hai. Kaunsa chahiye?` };
      if (wanted.length === 1 && (wanted[0].id !== state.productId || !pin)) {
        const keep = state.step === 'AWAIT_CONFIRM' ? { address: state.address, pin: state.pin } : state.step === 'AWAIT_NAME' && state.address ? { address: state.address, pin: state.pin! } : undefined;
        return startCheckout(ctx, wanted[0], parseQuantity(text, spans.get(wanted[0].id)), keep);
      }

      if (state.step === 'AWAIT_NAME') {
        const name = validateName(text);
        if (!name.ok) return { intent: 'SHOP', text: 'Delivery ke liye apna poora naam bhejein (sirf naam, number ke bina). Sirf "haan" likhne se naam save nahi hota.' };
        await db.user.update({ where: { phone: ctx.phone }, data: { name: name.name } });
        if (state.address && state.pin) return confirmationReply(ctx, stateProduct, state.quantity, name.name, state.address, state.pin);
        await writeState(ctx.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), productId: state.productId, quantity: state.quantity });
        return { intent: 'SHOP', text: 'Dhanyavaad. Ab poora delivery address, area/city, state aur 6-digit PIN code ek message mein bhejein.' };
      }

      const qty = parseExplicitQuantity(text);
      if (qty != null) {
        if (qty > stateProduct.stock) return { intent: 'SHOP', text: `${stateProduct.name} ka sirf ${stateProduct.stock} stock available hai.` };
        if (state.step === 'AWAIT_CONFIRM') {
          const u = await db.user.findUnique({ where: { phone: ctx.phone } });
          return confirmationReply(ctx, stateProduct, qty, u?.name || 'Customer', state.address, state.pin);
        }
        await writeState(ctx.conversationId, { ...state, quantity: qty, at: Date.now() });
        return { intent: 'SHOP', text: `Quantity ${qty} set kar di. Ab poora delivery address aur 6-digit PIN code bhejein.` };
      }

      if (state.step === 'AWAIT_CONFIRM' && isYes(text)) return placeOrder(ctx, state, stateProduct);
      if (state.step === 'AWAIT_CONFIRM' && /address|pata|badal|change/i.test(text) && !pin) {
        await writeState(ctx.conversationId, { step: 'AWAIT_ADDRESS', at: Date.now(), productId: state.productId, quantity: state.quantity });
        return { intent: 'SHOP', text: 'Theek hai. Naya poora delivery address aur 6-digit PIN code ek message mein bhejein.' };
      }

      const check = validateAddress(text);
      if (!check.ok) {
        if (state.step === 'AWAIT_CONFIRM') return { intent: 'SHOP', text: 'Order confirm karne ke liye "haan" likhein, address badalne ke liye naya poora address bhejein, ya "cancel" likhein.' };
        return { intent: 'SHOP', text: check.reason };
      }
      const u = await db.user.findUnique({ where: { phone: ctx.phone } });
      if (!u?.name) {
        await writeState(ctx.conversationId, { step: 'AWAIT_NAME', at: Date.now(), productId: state.productId, quantity: state.quantity, address: check.address, pin: check.pin });
        return { intent: 'SHOP', text: 'Address mil gaya. Ab delivery ke liye apna poora naam bhejein.' };
      }
      return confirmationReply(ctx, stateProduct, state.quantity, u.name, check.address, check.pin);
    }
  }
}

async function placeOrder(ctx: Ctx, state: Extract<State, { step: 'AWAIT_CONFIRM' }>, p: ProductRow): Promise<BotReply> {
  const fresh = await db.product.findUnique({ where: { id: p.id } });
  if (!fresh || !isSellable(fresh) || fresh.stock < state.quantity) {
    await writeState(ctx.conversationId, null);
    return { intent: 'SHOP', text: `${p.name} ab ${state.quantity} quantity mein available nahi hai. "products" likhkar current list dekhein.` };
  }
  const user = await db.user.findUnique({ where: { phone: ctx.phone } });
  if (!user) return { intent: 'SHOP', text: `Aapka profile nahi mila. Kripya dobara shuru karein. ${SUPPORT}` };

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
    const link: any = await createOrderPaymentLink({ amount: total, orderNumber, name: user.name, email: user.email, phone: ctx.phone });
    const url = String(link?.short_url || '');
    if (!link?.id || !url) throw new Error('Payment provider did not return a payment URL');
    await db.order.update({ where: { id: order.id }, data: { razorpayOrderId: String(link.id) } });
    await writeState(ctx.conversationId, null);
    if (String(link.id).startsWith('mock_')) {
      return { intent: 'SHOP_ORDER', text: `Order ${orderNumber} ka demo record bana hai, lekin MOCK_PROVIDERS enabled hai. Yeh real payment link nahi hai, payment na karein.` };
    }
    return {
      intent: 'SHOP_ORDER',
      text: `Aapka order create ho gaya hai.\nOrder: ${orderNumber}\nProduct: ${fresh.name} x ${state.quantity}\nProduct price: ${money(subtotal)}\nDelivery: ${money(shippingFee)}\nTotal: ${money(total)}\n\nPayment link: ${url}\n\nPayment verify hone ke baad hi order confirm maana jayega, aur confirmation isi WhatsApp par aa jayegi. Payment ke baad status ke liye order number bhejein.`,
    };
  } catch (e: any) {
    console.error('[BOT] Order payment link failed:', e?.error?.description || e?.message || e);
    await db.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', paymentStatus: 'FAILED' } }).catch(() => undefined);
    // Keep the confirm step so the customer can simply say "haan" again.
    await writeState(ctx.conversationId, { ...state, at: Date.now() });
    return { intent: 'SHOP_ERROR', text: `Abhi payment link nahi ban saka, isliye koi payment na karein. Kuch der baad "haan" likhkar dobara try karein. ${SUPPORT}` };
  }
}

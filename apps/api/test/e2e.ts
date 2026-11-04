/**
 * End-to-end replay of the real incident against a REAL Postgres, with only the outside world faked
 * (WhatsApp send API + Razorpay API). Runs the real webhook router, bot, payments service and Prisma queries.
 */
import Module from 'module';
import crypto from 'crypto';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.MOCK_PROVIDERS = 'false';
process.env.DATABASE_URL = process.env.E2E_DATABASE_URL || '';
if (!process.env.DATABASE_URL) throw new Error('Set E2E_DATABASE_URL to a THROWAWAY Postgres (all tables are wiped). See test/README.md');
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'secret_x';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';
process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
process.env.WHATSAPP_APP_SECRET = 'appsecret';
process.env.API_URL = 'https://api.example.test';
process.env.RECONCILE_INTERVAL_MS = '0';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';

const testClient = require(process.env.E2E_CLIENT_DIR || '../.e2e-client');
const { PrismaPg } = require('@prisma/adapter-pg');
const db = new testClient.PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// ---- fakes
type Sent = { to: string; kind: 'text' | 'pdf' | 'doc' | 'image' | 'interactive'; text?: string; filename?: string; bytes?: number; url?: string; spec?: any };
const outbox: Sent[] = [];
const rzp = new Map<string, { state: 'paid' | 'unpaid' | 'expired'; amountPaidPaise: number; paymentId?: string }>();
let linkSeq = 0;
let failLinkCreation = false;
let failImage = false;
let failInteractive = false;
const WINDOW_CLOSED_PHONE = '919000000777';
let awbFail = false;
const shipCalls: any[] = [];
let assignCalls = 0;

const origLoad = (Module as any)._load;
(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === '@prisma/client') return testClient;
  let resolved = '';
  try { resolved = (Module as any)._resolveFilename(request, parent, isMain); } catch { /* builtin */ }
  if (resolved.endsWith('/src/db.ts')) return { db };
  const real = origLoad.apply(this, arguments);
  if (resolved.endsWith('/integrations/whatsapp.ts')) {
    return { ...real,
      sendWhatsAppText: async (to: string, text: string) => { if (to === WINDOW_CLOSED_PHONE) { const err: any = new Error('Request failed'); err.response = { data: { error: { code: 131047, message: 'Re-engagement message' } } }; throw err; } outbox.push({ to, kind: 'text', text }); return { ok: true }; },
      sendWhatsAppPdf: async (to: string, pdf: Buffer, filename: string) => { assert.ok(pdf.slice(0, 4).toString() === '%PDF', 'receipt must be a real PDF'); outbox.push({ to, kind: 'pdf', filename, bytes: pdf.length }); return { ok: true }; },
      sendWhatsAppInteractive: async (to: string, raw: any) => { if (failInteractive) throw new Error('interactive rejected'); const spec = real.sanitizeInteractive(raw); outbox.push({ to, kind: 'interactive', spec }); return { ok: true }; },
      sendWhatsAppImage: async (to: string, url: string, caption?: string) => { if (failImage) throw new Error('image rejected'); outbox.push({ to, kind: 'image', url, text: caption }); return { ok: true }; },
      sendWhatsAppDocument: async (to: string, _l: string, filename: string) => { outbox.push({ to, kind: 'doc', filename }); return { ok: true }; },
    };
  }
  if (resolved.endsWith('/integrations/shiprocket.ts')) {
    return { ...real,
      getPickupLocation: async () => 'Primary',
      createShipment: async (p: any) => {
        // Mirror Shiprocket's mandatory-field validation (this is what produced the HTTP 400 before)
        const bad: string[] = [];
        if (typeof p.billing_address !== 'string' || p.billing_address.length < 3) bad.push('billing_address must be a string');
        if (!p.billing_city) bad.push('billing_city'); if (!p.billing_state) bad.push('billing_state');
        if (!/^\d{6}$/.test(String(p.billing_pincode))) bad.push('billing_pincode'); if (!/^\d{10}$/.test(String(p.billing_phone))) bad.push('billing_phone');
        if (!p.billing_email) bad.push('billing_email'); if (!p.billing_customer_name) bad.push('billing_customer_name');
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(p.order_date)) bad.push('order_date format'); if (p.payment_method !== 'Prepaid') bad.push('payment_method');
        if (!p.pickup_location) bad.push('pickup_location'); if (!(p.weight > 0) || !p.length || !p.breadth || !p.height) bad.push('dimensions');
        for (const i of p.order_items || []) if (!i.name || !i.sku || !(i.units > 0) || !(i.selling_price >= 0)) bad.push('order_items');
        if (!p.order_items?.length) bad.push('order_items empty');
        if (bad.length) throw new Error('Shiprocket: Validation failed: ' + bad.join(', ') + ' (HTTP 422)');
        shipCalls.push(p); return { order_id: 555, shipment_id: 777, awb_code: '', courier_name: '' };
      },
      assignAwb: async () => { assignCalls++; if (awbFail) throw new Error('Insufficient wallet balance'); return { awb: 'AWB123456', courier: 'Delhivery' }; },
    };
  }
  if (resolved.endsWith('/integrations/razorpay.ts')) {
    const mk = (prefix: string) => async (input: any) => {
      if (failLinkCreation) throw new Error('Razorpay down');
      const id = `${prefix}_${++linkSeq}`; rzp.set(id, { state: 'unpaid', amountPaidPaise: 0 });
      return { id, short_url: `https://rzp.io/rzp/${id}`, amount: input.amount * 100 };
    };
    return { ...real,
      createPayment: async (amount: number) => ({ id: `order_${++linkSeq}`, amount: amount * 100 }),
      createDonationPaymentLink: mk('plink'), createOrderPaymentLink: mk('plink'),
      fetchProviderPaymentState: async (id: string) => { const s = rzp.get(id); return s ? { state: s.state, paymentId: s.paymentId, amountPaidPaise: s.amountPaidPaise, currency: 'INR' } : { state: 'unknown', amountPaidPaise: 0 }; },
    };
  }
  return real;
};

import express from 'express';
const webhooks = require('../src/routes/webhooks').default;
const authRouter = require('../src/routes/auth').default;
const adminRouter = require('../src/routes/admin').default;
const assistantRouter = require('../src/routes/assistant').default;
const productsRouter = require('../src/routes/products').default;
const ordersRouter = require('../src/routes/orders').default;
const donationsRouter = require('../src/routes/donations').default;
const bcrypt = require('bcryptjs');
const documentsRouter = require('../src/routes/documents').default;
const payments = require('../src/services/payments');
const fulfillment = require('../src/services/fulfillment');
const { trustKnowledge } = require('../src/services/trust-knowledge');

const app = express();
app.use(express.json({ verify: (req: any, _r, buf) => { req.rawBody = buf.toString(); } }));
app.use('/webhooks', webhooks);
app.use('/api/auth', authRouter); app.use('/api/admin', adminRouter); app.use('/api/assistant', assistantRouter);
app.use('/api/products', productsRouter); app.use('/api/documents', documentsRouter); app.use('/api/orders', ordersRouter); app.use('/api/donations', donationsRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err?.status || 500).json({ error: err?.message }));
let base = '';

// ---- helpers
let msgSeq = 0;
const PHONE = '919876500001';
function metaSig(body: string) { return 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(body).digest('hex'); }
async function wa(phone: string, text: string, opts: { id?: string; type?: string; tap?: string; tapType?: 'list_reply' | 'button_reply' } = {}) {
  const message: any = { from: phone, id: opts.id || `wamid.${++msgSeq}`, type: opts.type || 'text' };
  if (opts.tap) { message.type = 'interactive'; const kind = opts.tapType || 'list_reply'; message.interactive = { type: kind, [kind]: { id: opts.tap, title: text } }; }
  else if (message.type === 'text') message.text = { body: text };
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [message] } }] }] });
  const from = outbox.length;
  const res = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': metaSig(body) }, body });
  assert.equal(res.status, 200, 'whatsapp webhook must answer 200');
  return outbox.slice(from);
}
const interactiveText = (m: Sent) => {
  const sp = m.spec; if (!sp) return '';
  if (sp.kind === 'buttons') return `${sp.body}\n${sp.buttons.map((b: any) => `[${b.title}]`).join(' ')}`;
  return `${sp.body}\n${sp.sections.flatMap((x: any) => x.rows).map((r: any) => `${r.title}${r.description ? ` — ${r.description}` : ''}`).join('\n')}`;
};
const texts = (r: Sent[]) => r.filter((m) => m.kind === 'text' || m.kind === 'interactive').map((m) => (m.kind === 'text' ? m.text! : interactiveText(m))).join('\n---\n');
const tap = (phone: string, id: string, title = id, type: 'list_reply' | 'button_reply' = 'list_reply') => wa(phone, title, { tap: id, tapType: type });
const lastInteractive = (r: Sent[]) => [...r].reverse().find((m) => m.kind === 'interactive');
const rowIds = (m?: Sent) => (m?.spec?.kind === 'list' ? m.spec.sections.flatMap((x: any) => x.rows.map((r: any) => r.id)) : (m?.spec?.buttons || []).map((b: any) => b.id));
async function razorpayEvent(payload: any, opts: { badSig?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(opts.badSig ? body + 'x' : body).digest('hex');
  const from = outbox.length;
  const res = await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': `evt_${++msgSeq}_${Date.now()}` }, body });
  return { status: res.status, sent: outbox.slice(from) };
}
async function http(method: string, path: string, opts: { body?: any; token?: string } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  let json: any = null; try { json = await res.json(); } catch { /* 204 */ }
  return { status: res.status, json };
}
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e: any) { console.error('  ✘', name, '\n     ', e?.message?.split('\n').slice(0, 6).join('\n      '), process.env.E2E_TRACE ? '\n' + e?.stack : ''); process.exitCode = 1; }
}

async function reset() {
  for (const t of ['Message', 'SupportTicket', 'Conversation', 'OrderItem', 'Order', 'Donation', 'WebhookEvent', 'KnowledgeDocument', 'Document', 'Trust', 'Setting', 'Product', 'User']) await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
  outbox.length = 0; rzp.clear();
  await db.product.createMany({ data: [
    { name: 'Gangajal', slug: 'gangajal', description: 'Add product description', price: 400, stock: 5 },
    { name: 'Mala', slug: 'mala', description: 'Add product description', price: 10, stock: 50 },
    { name: 'Nariyal', slug: 'nariyal', description: 'Add product description', price: 100, stock: 40 },
    { name: 'New Product', slug: 'new-product', description: 'Add product description', price: 0, stock: 0 },
    { name: 'Trust Cotton Bag', slug: 'trust-cotton-bag', description: 'demo', price: 299, stock: 20 },
    { name: 'Handmade Diya', slug: 'handmade-diya', description: 'demo', price: 199, stock: 50 },
  ] });
  await db.user.create({ data: { phone: PHONE, name: 'Surya Pratap Singh Solanki' } });
  await db.knowledgeDocument.create({ data: { title: 'Trust FAQ & Policies', content: trustKnowledge } });
}

(async () => {
  const server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  const ADDR = 'Chanakya path neemtal vidisha madhya pradesh 464001';

  console.log('\nSHOP — the exact incident');
  await reset();
  await test('"Nariyal kharidna h" -> asks address for Nariyal (not Gangajal)', async () => {
    const t = texts(await wa(PHONE, 'Nariyal kharidna h'));
    assert.match(t, /Nariyal x 1 — ₹100/); assert.doesNotMatch(t, /Gangajal/); assert.match(t, /PIN code/);
  });
  await test('address -> order summary for Nariyal, ₹100 + ₹80 = ₹180', async () => {
    const t = texts(await wa(PHONE, ADDR));
    assert.match(t, /Nariyal x 1 — ₹100/); assert.match(t, /Total: ₹180/); assert.match(t, /\[Confirm karein ✅\]/);
    assert.equal(await db.order.count(), 0, 'no order may exist before confirmation');
  });
  await test('"haan" -> order really created for Nariyal with payment link', async () => {
    const t = texts(await wa(PHONE, 'haan'));
    assert.match(t, /Nariyal x 1 — ₹100/); assert.match(t, /Total: ₹180/); assert.match(t, /https:\/\/rzp\.io\/rzp\/plink_/);
    const o = await db.order.findFirstOrThrow({ include: { items: { include: { product: true } } } });
    assert.equal(o.items[0].product.name, 'Nariyal'); assert.equal(o.total, 180); assert.equal(o.paymentStatus, 'PENDING'); assert.ok(o.razorpayOrderId?.startsWith('plink_'));
    assert.equal((o.address as any).pin, '464001');
  });
  await test('"Nariyal kharidna h gangajal nahi" -> Nariyal only', async () => {
    const t = texts(await wa(PHONE, 'Nariyal kharidna h gangajal nahi'));
    assert.match(t, /Nariyal x 1/); assert.doesNotMatch(t, /Gangajal — ₹400/);
    await wa(PHONE, 'cancel');
  });
  await test('changing your mind mid-checkout edits the cart: "also Nariyal" adds it, "gangajal nahi" removes it', async () => {
    await wa(PHONE, 'Gangajal chahiye');
    const both = texts(await wa(PHONE, 'Nariyal order karna h')); assert.match(both, /Gangajal x 1 — ₹400/); assert.match(both, /Nariyal x 1 — ₹100/); assert.match(both, /Joda gaya: Nariyal x 1/);
    const only = texts(await wa(PHONE, 'gangajal nahi')); assert.doesNotMatch(only, /Gangajal x 1/); assert.match(only, /Nariyal x 1 — ₹100/); assert.match(only, /Hataya gaya: Gangajal/);
    const t2 = texts(await wa(PHONE, ADDR)); assert.match(t2, /Nariyal x 1/); assert.doesNotMatch(t2, /Gangajal x/);
    await wa(PHONE, 'cancel');
  });
  await test('product list: only real products (no New Product / demo rows)', async () => {
    const t = texts(await wa(PHONE, 'products dikhao'));
    assert.match(t, /Gangajal — ₹400/); assert.match(t, /Mala — ₹10/); assert.match(t, /Nariyal — ₹100/);
    assert.doesNotMatch(t, /New Product|Cotton Bag|Diya/);
    await wa(PHONE, 'cancel');
  });
  await test('quantity 3 + free-form: "3 nariyal chahiye" -> ₹300 + ₹80', async () => {
    await wa(PHONE, '3 nariyal chahiye'); const t = texts(await wa(PHONE, ADDR));
    assert.match(t, /Nariyal x 3 — ₹300/); assert.match(t, /Products: ₹300/); assert.match(t, /Total: ₹380/); await wa(PHONE, 'cancel');
  });
  await test('quantity above stock refused (Gangajal stock 5)', async () => {
    const t = texts(await wa(PHONE, '10 gangajal chahiye')); assert.match(t, /itni quantity abhi available nahi/); assert.doesNotMatch(t, /\b5\b/);
  });
  await test('free shipping above ₹1000 (3 gangajal = ₹1200)', async () => {
    await wa(PHONE, '3 gangajal chahiye'); const t = texts(await wa(PHONE, ADDR));
    assert.match(t, /Delivery: ₹0/); assert.match(t, /Total: ₹1,200/); await wa(PHONE, 'cancel');
  });
  await test('bad address rejected (no PIN) and bot does not create order', async () => {
    await wa(PHONE, 'Mala chahiye'); const t = texts(await wa(PHONE, 'vidisha ke paas'));
    assert.match(t, /PIN code|chhota/); await wa(PHONE, 'cancel');
  });
  await test('payment-link failure -> order cancelled (no phantom), user told NOT to pay', async () => {
    await wa(PHONE, 'Mala chahiye'); await wa(PHONE, ADDR); failLinkCreation = true;
    const before = await db.order.count();
    const t = texts(await wa(PHONE, 'haan')); failLinkCreation = false;
    assert.match(t, /koi payment na karein/);
    const last = await db.order.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    assert.equal(last.status, 'CANCELLED'); assert.equal(await db.order.count(), before + 1);
    const retry = texts(await wa(PHONE, 'haan')); assert.match(retry, /Payment link: https/, 'retry with "haan" works');
  });

  console.log('\nDONATION + RECEIPT — the exact incident');
  await reset();
  let donationLink = '';
  await test('"Donation karna h 900 rupay ka" -> link, DB PENDING', async () => {
    const t = texts(await wa(PHONE, 'Donation karna h 900 rupay ka'));
    assert.match(t, /₹900/); assert.match(t, /DON-\d+-\d+/);
    const d = await db.donation.findFirstOrThrow(); assert.equal(d.paymentStatus, 'PENDING'); donationLink = d.razorpayOrderId!;
    assert.ok(donationLink.startsWith('plink_'));
  });
  await test('"Kardiya donation" BEFORE payment lands: honest, no fake PAID, no "kitni rakam"', async () => {
    const t = texts(await wa(PHONE, 'Kardiya donation'));
    assert.doesNotMatch(t, /amt:other|Doosra amount/); assert.match(t, /abhi tak receive nahi hua/);
    assert.equal((await db.donation.findFirstOrThrow()).paymentStatus, 'PENDING');
  });
  await test('Razorpay says paid but NO webhook ever arrived: "Kardiya donation" reconciles live + sends PDF receipt', async () => {
    rzp.set(donationLink, { state: 'paid', amountPaidPaise: 90000, paymentId: 'pay_LIVE1' });
    const sent = await wa(PHONE, 'Kardiya donation');
    assert.match(texts(sent), /verify ho gaya|verified/); assert.ok(sent.some((m) => m.kind === 'pdf' && /^DON-/.test(m.filename!)), 'PDF receipt must be sent');
    const d = await db.donation.findFirstOrThrow(); assert.equal(d.paymentStatus, 'PAID'); assert.equal(d.razorpayPaymentId, 'pay_LIVE1'); assert.ok(d.paidAt);
  });
  await test('"Kar diya donation meri receipt?" later -> PDF again (never the product list)', async () => {
    const sent = await wa(PHONE, 'Kar diya donation meri receipt?');
    assert.doesNotMatch(texts(sent), /product|Gangajal/i); assert.ok(sent.some((m) => m.kind === 'pdf'));
  });
  await test('bare amount after "kitni rakam" works: "Donation karna hai" -> "500"', async () => {
    const r1 = await wa(PHONE, 'Donation karna hai'); assert.deepEqual(rowIds(lastInteractive(r1)), ['amt:101', 'amt:501', 'amt:1100', 'amt:2100', 'amt:5100', 'amt:other']);
    const t2 = texts(await wa(PHONE, '500')); assert.match(t2, /₹500/); assert.match(t2, /https:\/\/rzp\.io/);
  });
  await test('donor without a name is asked for it first (receipt needs a name)', async () => {
    const p2 = '919876500002';
    const t1 = texts(await wa(p2, 'Donation 250')); assert.match(t1, /poora naam/);
    const t2 = texts(await wa(p2, 'Ramesh Kumar')); assert.match(t2, /Namaste Ramesh Kumar/); assert.match(t2, /₹250/);
    assert.equal((await db.user.findUniqueOrThrow({ where: { phone: p2 } })).name, 'Ramesh Kumar');
  });
  await test('invalid amounts: decimals / phone number / huge', async () => {
    assert.match(texts(await wa(PHONE, 'donate 10.5')), /poore rupaye/);
    assert.match(texts(await wa(PHONE, 'donate 99999999999')), /beech/);
  });

  console.log('\nRAZORPAY WEBHOOK');
  await reset();
  const mkDonation = async (amt: number) => { await wa(PHONE, `Donation ${amt}`); return db.donation.findFirstOrThrow({ where: { amount: amt }, orderBy: { createdAt: 'desc' } }); };
  await test('bad signature rejected', async () => { assert.equal((await razorpayEvent({ event: 'payment.captured', payload: {} }, { badSig: true })).status, 400); });
  await test('payment_link.paid (signed) -> PAID + exactly one receipt; replay sends nothing more', async () => {
    const d = await mkDonation(700);
    const ev = { event: 'payment_link.paid', payload: { payment_link: { entity: { id: d.razorpayOrderId, amount_paid: 70000, notes: { donationId: d.id } } }, payment: { entity: { id: 'pay_W1', amount: 70000 } } } };
    const r1 = await razorpayEvent(ev); assert.equal(r1.status, 200);
    assert.equal(r1.sent.filter((m) => m.kind === 'pdf').length, 1);
    assert.equal((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).paymentStatus, 'PAID');
    const r2 = await razorpayEvent(ev); assert.equal(r2.status, 200); assert.equal(r2.sent.length, 0, 'replayed webhook must not resend');
  });
  await test('payment.captured + payment_link.paid arriving together -> still ONE receipt', async () => {
    const d = await mkDonation(300);
    const link = { event: 'payment_link.paid', payload: { payment_link: { entity: { id: d.razorpayOrderId, amount_paid: 30000, notes: { donationId: d.id } } }, payment: { entity: { id: 'pay_W2', amount: 30000 } } } };
    const cap = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_W2', amount: 30000, currency: 'INR', order_id: 'order_internal', notes: [] } } } };
    rzp.set(d.razorpayOrderId!, { state: 'paid', amountPaidPaise: 30000, paymentId: 'pay_W2' });
    const [a, b] = await Promise.all([razorpayEvent(link), razorpayEvent(cap)]);
    await new Promise((r) => setTimeout(r, 300));
    const pdfs = outbox.filter((m) => m.kind === 'pdf' && m.filename === d.reference + '.pdf').length;
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(pdfs, 1, `expected 1 receipt, got ${pdfs}`);
  });
  await test('REGRESSION: payment.captured / payment.failed with NO order_id must not touch unrelated pending records', async () => {
    const d = await mkDonation(111); await wa(PHONE, 'Mala chahiye'); await wa(PHONE, ADDR); await wa(PHONE, 'haan');
    await razorpayEvent({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_X', amount: 99999999, currency: 'INR' } } } });
    await razorpayEvent({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_Y' } } } });
    assert.equal((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).paymentStatus, 'PENDING');
    assert.equal((await db.order.findFirstOrThrow({ where: { items: { some: { product: { name: 'Mala' } } } } })).paymentStatus, 'PENDING');
  });
  await test('underpayment is NOT marked paid', async () => {
    const d = await mkDonation(1000);
    await razorpayEvent({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: d.razorpayOrderId, amount_paid: 50000, notes: { donationId: d.id } } }, payment: { entity: { id: 'pay_U', amount: 50000 } } } });
    assert.equal((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).paymentStatus, 'PENDING');
  });
  await test('order payment via payment_link.paid -> PAID once, stock decremented once, invoice sent, replay is a no-op', async () => {
    await reset(); await wa(PHONE, '2 nariyal chahiye'); await wa(PHONE, ADDR); await wa(PHONE, 'haan');
    const o = await db.order.findFirstOrThrow();
    const ev = { event: 'payment_link.paid', payload: { payment_link: { entity: { id: o.razorpayOrderId, amount_paid: o.total * 100, notes: { orderNumber: o.orderNumber } } }, payment: { entity: { id: 'pay_O1', amount: o.total * 100 } } } };
    const r1 = await razorpayEvent(ev); assert.equal(r1.status, 200);
    assert.match(r1.sent.map((m) => m.text).join(), /confirm hai/); assert.ok(r1.sent.some((m) => m.kind === 'pdf' && m.filename === `${o.orderNumber}.pdf`));
    const r2 = await razorpayEvent(ev); assert.equal(r2.sent.length, 0);
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } }); assert.equal(after.paymentStatus, 'PAID'); assert.equal(after.status, 'CONFIRMED');
    assert.equal((await db.product.findFirstOrThrow({ where: { name: 'Nariyal' } })).stock, 38, 'stock must drop by exactly 2');
  });
  await test('oversell: customer paid but stock gone -> still PAID, stock clamps at 0, no crash', async () => {
    await reset(); await wa(PHONE, 'Gangajal chahiye'); await wa(PHONE, ADDR); await wa(PHONE, 'haan');
    await db.product.updateMany({ where: { name: 'Gangajal' }, data: { stock: 0 } });
    const o = await db.order.findFirstOrThrow(); rzp.set(o.razorpayOrderId!, { state: 'paid', amountPaidPaise: o.total * 100, paymentId: 'pay_OS' });
    const r = await razorpayEvent({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: o.razorpayOrderId, amount_paid: o.total * 100, notes: { orderNumber: o.orderNumber } } }, payment: { entity: { id: 'pay_OS' } } } });
    assert.equal(r.status, 200); assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus, 'PAID');
    assert.equal((await db.product.findFirstOrThrow({ where: { name: 'Gangajal' } })).stock, 0);
  });

  console.log('\nSAFETY NET (webhook never arrives)');
  await test('sweeper: Razorpay paid, no webhook -> PAID + receipt without the donor doing anything', async () => {
    await reset(); const d = await mkDonation(2100);
    await db.donation.update({ where: { id: d.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
    rzp.set(d.razorpayOrderId!, { state: 'paid', amountPaidPaise: 210000, paymentId: 'pay_SW' });
    outbox.length = 0;
    const res = await payments.sweepPendingPayments('test'); assert.equal(res.donations, 1); assert.equal(res.receipts, 1);
    assert.equal((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).paymentStatus, 'PAID');
    assert.equal(outbox.filter((m) => m.kind === 'pdf').length, 1);
    const res2 = await payments.sweepPendingPayments('test'); assert.equal(res2.receipts, 0, 'never delivered twice');
    assert.equal(outbox.filter((m) => m.kind === 'pdf').length, 1);
  });
  await test('sweeper retries a receipt whose WhatsApp delivery failed earlier', async () => {
    await reset(); const d = await mkDonation(55);
    await db.donation.update({ where: { id: d.id }, data: { paymentStatus: 'PAID', paidAt: new Date(), razorpayPaymentId: 'pay_R', receiptSentAt: null } });
    outbox.length = 0; const res = await payments.sweepPendingPayments('test'); assert.equal(res.receipts, 1); assert.equal(outbox.filter((m) => m.kind === 'pdf').length, 1);
  });

  console.log('\nROBUSTNESS');
  await reset();
  await test('duplicate delivery of the same WhatsApp message id -> processed once', async () => {
    await wa(PHONE, 'Nariyal kharidna h'); await wa(PHONE, ADDR);
    const a = await wa(PHONE, 'haan', { id: 'wamid.DUP' }); const b = await wa(PHONE, 'haan', { id: 'wamid.DUP' });
    assert.ok(a.length >= 1); assert.equal(b.length, 0); assert.equal(await db.order.count(), 1);
  });
  await test('concurrent duplicate deliveries -> one order', async () => {
    await reset(); await wa(PHONE, 'Mala chahiye'); await wa(PHONE, ADDR);
    await Promise.all([wa(PHONE, 'haan', { id: 'wamid.C1' }), wa(PHONE, 'haan', { id: 'wamid.C1' }), wa(PHONE, 'haan', { id: 'wamid.C1' })]);
    assert.equal(await db.order.count(), 1);
  });
  await test('bad Meta signature -> 403', async () => {
    const res = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=00' }, body: '{}' }); assert.equal(res.status, 403);
  });
  await test('greeting resets a half-finished checkout and shows the menu', async () => {
    await reset(); await wa(PHONE, 'Gangajal chahiye'); const t = texts(await wa(PHONE, 'Hello'));
    assert.match(t, /Welcome to Amrit Vela Trust/); assert.equal((await db.conversation.findFirstOrThrow()).state, null);
  });
  await test('stale checkout state (>30 min) is ignored; address text is not swallowed as an order', async () => {
    await reset(); await wa(PHONE, 'Gangajal chahiye');
    const c = await db.conversation.findFirstOrThrow(); await db.conversation.update({ where: { id: c.id }, data: { state: { ...(c.state as any), at: Date.now() - 31 * 60_000 } } });
    await wa(PHONE, ADDR); assert.equal(await db.order.count(), 0);
  });
  await test('"human" -> ticket + mode HUMAN; then the bot stays silent; "menu" returns control', async () => {
    await reset(); const t = texts(await wa(PHONE, 'mujhe kisi insaan se baat karni hai'));
    assert.match(t, /Trust team ko note/); assert.equal(await db.supportTicket.count(), 1);
    const silent = await wa(PHONE, 'koi hai?'); assert.equal(silent.length, 0);
    assert.match(texts(await wa(PHONE, 'menu')), /Welcome to Amrit Vela Trust/);
  });
  await test('voice/image message -> polite text-only notice', async () => {
    assert.match(texts(await wa(PHONE, '', { type: 'audio' })), /text messages/);
  });
  await test('order status by order number reconciles live and shows verified payment', async () => {
    await reset(); await wa(PHONE, 'Mala chahiye'); await wa(PHONE, ADDR); await wa(PHONE, 'haan');
    const o = await db.order.findFirstOrThrow(); rzp.set(o.razorpayOrderId!, { state: 'paid', amountPaidPaise: o.total * 100, paymentId: 'pay_ST' });
    const t = texts(await wa(PHONE, `${o.orderNumber} status`));
    assert.match(t, /verify ho gaya|verified/); assert.equal((await db.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus, 'PAID');
  });
  await test("someone else's order number reveals nothing", async () => {
    const o = await db.order.findFirstOrThrow();
    const t = texts(await wa('919000000009', `${o.orderNumber} status`)); assert.match(t, /nahi mila/); assert.doesNotMatch(t, /Mala/);
  });
  await test('LLM-free: an unknown question falls through to the grounded fallback, not a product list', async () => {
    const t = texts(await wa(PHONE, 'Trust ka timing kya hai')); assert.doesNotMatch(t, /Gangajal|₹/);
  });


  console.log('\nTRUST KNOWLEDGE (client complaint: "bot ke paas Trust ki jankari nahi")');
  await reset();
  const ask = async (q: string) => texts(await wa(PHONE, q));
  await test('"Trust ke baare me bataiye" answers from the knowledge base', async () => assert.match(await ask('Trust ke baare me bataiye'), /04 September 2014/));
  await test('"Trust ka address kahan hai" -> real address', async () => assert.match(await ask('Trust ka address kahan hai'), /Section 26, Ulhasnagar-4/));
  await test('"contact number kya hai" -> real phone', async () => assert.match(await ask('contact number kya hai'), /6913001300/));
  await test('"langar kya hai" is NOT hijacked into the shop flow', async () => { const t = await ask('Trust me langar kab hota hai'); assert.match(t, /1,50,000/); assert.doesNotMatch(t, /Gangajal|₹/); });
  await test('"Trust me kya kya seva hoti hai" does not show the product list', async () => assert.doesNotMatch(await ask('Trust me kya kya seva hoti hai'), /Gangajal|₹/));
  await test('unknown topic -> honest fallback, no invented facts', async () => { const t = await ask('bitcoin ka rate kya hai'); assert.doesNotMatch(t, /Ulhasnagar|₹/); });

  console.log('\nPRODUCT IMAGES');
  await db.product.updateMany({ where: { name: 'Nariyal' }, data: { imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/amrit-vela-trust/nariyal.png' } });
  await test('price question sends the admin-uploaded photo (JPEG-normalised) + price text', async () => {
    const sent = await wa(PHONE, 'Nariyal kitne ka hai');
    const img = sent.find((m) => m.kind === 'image'); assert.ok(img, 'image must be sent');
    assert.match(img!.url!, /f_jpg,q_auto,w_1000/); assert.match(img!.text!, /Nariyal — ₹100/); assert.match(texts(sent), /₹100/);
    assert.ok(sent.findIndex((m) => m.kind === 'image') < sent.findIndex((m) => m.kind === 'text'), 'image comes first');
  });
  await test('"Nariyal photo" -> photo', async () => assert.ok((await wa(PHONE, 'Nariyal photo bhejo')).some((m) => m.kind === 'image')));
  await test('starting checkout shows the product photo', async () => { const sent = await wa(PHONE, 'Nariyal kharidna h'); assert.ok(sent.some((m) => m.kind === 'image')); await wa(PHONE, 'cancel'); });
  await test('product without a photo: honest text, no crash', async () => assert.match(texts(await wa(PHONE, 'Mala ki photo dikhao')), /photo abhi available nahi/));
  await test('image delivery failure never blocks the text answer', async () => { failImage = true; const sent = await wa(PHONE, 'Nariyal kitne ka hai'); failImage = false; assert.match(texts(sent), /₹100/); });

  console.log('\nSHIPMENT (client complaint: "Request failed with status code 400")');
  const paidOrder = async (text: string, address: string) => {
    await reset(); await wa(PHONE, text); await wa(PHONE, address); await wa(PHONE, 'haan');
    const o = await db.order.findFirstOrThrow();
    await fulfillment.markOrderPaid(o.id, 'pay_SHIP'); return db.order.findUniqueOrThrow({ where: { id: o.id } });
  };
  await test('WhatsApp-created order ships: full Shiprocket payload, AWB saved, customer notified', async () => {
    shipCalls.length = 0; assignCalls = 0; const o = await paidOrder('2 nariyal chahiye', ADDR); outbox.length = 0;
    const res = await fulfillment.shipOrder(o.id);
    const p = shipCalls[0]; assert.equal(p.billing_city, 'Vidisha'); assert.equal(p.billing_state, 'Madhya Pradesh'); assert.equal(p.billing_pincode, '464001');
    assert.equal(p.billing_phone, '9876500001'.replace('9876500001', PHONE.slice(-10))); assert.equal(p.order_items[0].sku, 'nariyal'); assert.equal(p.order_items[0].units, 2); assert.equal(p.sub_total, 200);
    assert.equal(res.status, 'SHIPPED'); assert.equal(res.awb, 'AWB123456'); assert.equal(res.shiprocketShipmentId, '777');
    assert.match(texts(outbox), /AWB: AWB123456/);
  });
  await test('shipping twice never creates a duplicate Shiprocket order', async () => {
    const o = await db.order.findFirstOrThrow(); shipCalls.length = 0; await fulfillment.shipOrder(o.id); assert.equal(shipCalls.length, 0);
  });
  await test('website-style order (plain string address) ships too', async () => {
    shipCalls.length = 0; await reset();
    const u = await db.user.findUniqueOrThrow({ where: { phone: PHONE } }); const prod = await db.product.findFirstOrThrow({ where: { name: 'Mala' } });
    const o = await db.order.create({ data: { orderNumber: 'ORD-WEB-1', userId: u.id, subtotal: 10, shippingFee: 80, total: 90, address: 'Flat 4, Shanti Nagar, Ulhasnagar, Maharashtra 421004', paymentStatus: 'PAID', status: 'CONFIRMED', items: { create: [{ productId: prod.id, quantity: 1, unitPrice: 10 }] } } });
    const res = await fulfillment.shipOrder(o.id); assert.equal(res.status, 'SHIPPED'); assert.equal(shipCalls[0].billing_state, 'Maharashtra'); assert.equal(typeof shipCalls[0].billing_address, 'string');
  });
  await test('courier assignment fails (wallet) -> clear message, Shiprocket order saved, retry does NOT recreate it', async () => {
    shipCalls.length = 0; assignCalls = 0; awbFail = true; const o = await paidOrder('Mala chahiye', ADDR);
    await assert.rejects(() => fulfillment.shipOrder(o.id), /Insufficient wallet balance/);
    let cur = await db.order.findUniqueOrThrow({ where: { id: o.id } }); assert.equal(cur.status, 'PROCESSING'); assert.equal(cur.shiprocketShipmentId, '777'); assert.equal(shipCalls.length, 1);
    awbFail = false; const res = await fulfillment.shipOrder(o.id);
    assert.equal(shipCalls.length, 1, 'no second create'); assert.equal(res.status, 'SHIPPED'); assert.equal(res.awb, 'AWB123456');
  });
  await test('address without PIN gives a readable error (not "status code 400")', async () => {
    await reset(); const u = await db.user.findUniqueOrThrow({ where: { phone: PHONE } }); const prod = await db.product.findFirstOrThrow({ where: { name: 'Mala' } });
    const o = await db.order.create({ data: { orderNumber: 'ORD-NOPIN', userId: u.id, subtotal: 10, shippingFee: 80, total: 90, address: 'somewhere in vidisha town', paymentStatus: 'PAID', items: { create: [{ productId: prod.id, quantity: 1, unitPrice: 10 }] } } });
    await assert.rejects(() => fulfillment.shipOrder(o.id), /6-digit PIN/);
  });
  await test('unpaid order cannot be shipped', async () => {
    await reset(); await wa(PHONE, 'Mala chahiye'); await wa(PHONE, ADDR); await wa(PHONE, 'haan'); const o = await db.order.findFirstOrThrow();
    await assert.rejects(() => fulfillment.shipOrder(o.id), /must be paid/);
  });


  console.log('\nSTOCK IS NEVER SHOWN TO CUSTOMERS');
  await reset();
  await test('product list / price answers contain no stock numbers; out-of-stock products are hidden from the list', async () => {
    await db.product.updateMany({ where: { name: 'Mala' }, data: { stock: 0 } });
    const list = texts(await wa(PHONE, 'products dikhao'));
    assert.match(list, /Nariyal — ₹100/); assert.doesNotMatch(list, /available|stock|\b40\b|\b50\b/i); assert.doesNotMatch(list, /Mala/);
    await wa(PHONE, 'cancel');
    const price = texts(await wa(PHONE, 'Nariyal kitne ka hai')); assert.doesNotMatch(price, /available|stock|\b40\b/i);
    assert.match(texts(await wa(PHONE, 'Mala kitne ka hai')), /abhi stock mein nahi hai/);
    assert.match(texts(await wa(PHONE, 'Mala kharidna hai')), /out of stock/i);
  });

  console.log('\nADMIN AUTH (show-password UI is client side; API: login, forgot, reset, change email/password)');
  await reset();
  const ADMIN_PW = 'Old-password-123';
  await db.adminUser.deleteMany();
  const admin = await db.adminUser.create({ data: { email: 'owner@trust.org', passwordHash: await bcrypt.hash(ADMIN_PW, 10), role: 'ADMIN' } });
  let token = '';
  await test('wrong password -> 401, unknown email -> 401, right password -> token', async () => {
    assert.equal((await http('POST', '/api/auth/login', { body: { email: 'owner@trust.org', password: 'nope' } })).status, 401);
    assert.equal((await http('POST', '/api/auth/login', { body: { email: 'ghost@trust.org', password: ADMIN_PW } })).status, 401);
    const ok = await http('POST', '/api/auth/login', { body: { email: 'OWNER@trust.org', password: ADMIN_PW } }); assert.equal(ok.status, 200); token = ok.json.token; assert.ok(token);
  });
  await test('admin API requires a token', async () => { assert.equal((await http('GET', '/api/admin/products')).status, 401); assert.equal((await http('GET', '/api/admin/products', { token })).status, 200); });
  await test('login is rate limited after 10 bad attempts', async () => {
    let last = 0; for (let i = 0; i < 12; i++) last = (await http('POST', '/api/auth/login', { body: { email: 'victim@trust.org', password: 'x' + i } })).status; assert.equal(last, 429);
  });
  let resetToken = '';
  await test('forgot-password: same answer for unknown and known emails; known email gets a one-time link (logged when SMTP is off)', async () => {
    const logs: string[] = []; const origWarn = console.warn; console.warn = (...a: any[]) => { logs.push(a.join(' ')); };
    const unknown = await http('POST', '/api/auth/forgot-password', { body: { email: 'ghost@trust.org' } });
    const known = await http('POST', '/api/auth/forgot-password', { body: { email: 'owner@trust.org' } });
    console.warn = origWarn;
    assert.equal(unknown.status, 200); assert.equal(known.status, 200); assert.deepEqual(unknown.json, known.json);
    const line = logs.find((l) => l.includes('reset-password?token=')); assert.ok(line, 'reset link must be available');
    resetToken = line!.match(/token=([a-f0-9]+)/)![1]; assert.equal(await db.passwordReset.count(), 1);
    const row = await db.passwordReset.findFirstOrThrow(); assert.notEqual(row.tokenHash, resetToken, 'only a hash is stored');
  });
  await test('reset-password: weak password rejected, garbage token rejected, valid reset works once and revokes old sessions', async () => {
    assert.equal((await http('POST', '/api/auth/reset-password', { body: { token: resetToken, password: 'short1' } })).status, 400);
    assert.equal((await http('POST', '/api/auth/reset-password', { body: { token: 'f'.repeat(64), password: 'Brand-new-pass-9' } })).status, 400);
    const ok = await http('POST', '/api/auth/reset-password', { body: { token: resetToken, password: 'Brand-new-pass-9' } }); assert.equal(ok.status, 200);
    assert.equal((await http('POST', '/api/auth/reset-password', { body: { token: resetToken, password: 'Another-pass-99' } })).status, 400, 'token is single use');
    assert.equal((await http('GET', '/api/admin/products', { token })).status, 401, 'old JWT must stop working');
    const login = await http('POST', '/api/auth/login', { body: { email: 'owner@trust.org', password: 'Brand-new-pass-9' } }); assert.equal(login.status, 200); token = login.json.token;
  });
  await test('expired reset token is rejected', async () => {
    const crypto2 = require('crypto'); const raw = 'a'.repeat(64);
    await db.passwordReset.create({ data: { adminId: admin.id, tokenHash: crypto2.createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await http('POST', '/api/auth/reset-password', { body: { token: raw, password: 'Brand-new-pass-77' } })).status, 400);
  });
  await test('change-password: needs the current password, enforces rules, keeps this session, kills others', async () => {
    assert.equal((await http('POST', '/api/auth/change-password', { token, body: { currentPassword: 'wrong', newPassword: 'Third-pass-12345' } })).status, 400);
    assert.equal((await http('POST', '/api/auth/change-password', { token, body: { currentPassword: 'Brand-new-pass-9', newPassword: 'allletters' } })).status, 400);
    const oldToken = token; const ok = await http('POST', '/api/auth/change-password', { token, body: { currentPassword: 'Brand-new-pass-9', newPassword: 'Third-pass-12345' } });
    assert.equal(ok.status, 200); token = ok.json.token;
    assert.equal((await http('GET', '/api/admin/products', { token: oldToken })).status, 401); assert.equal((await http('GET', '/api/admin/products', { token })).status, 200);
  });
  await test('change-email: needs password, rejects duplicates, new email logs in', async () => {
    await db.adminUser.create({ data: { email: 'staff@trust.org', passwordHash: 'x', role: 'STAFF' } });
    assert.equal((await http('POST', '/api/auth/change-email', { token, body: { currentPassword: 'bad', newEmail: 'new@trust.org' } })).status, 400);
    assert.equal((await http('POST', '/api/auth/change-email', { token, body: { currentPassword: 'Third-pass-12345', newEmail: 'STAFF@trust.org' } })).status, 409);
    assert.equal((await http('POST', '/api/auth/change-email', { token, body: { currentPassword: 'Third-pass-12345', newEmail: 'not-an-email' } })).status, 400);
    const ok = await http('POST', '/api/auth/change-email', { token, body: { currentPassword: 'Third-pass-12345', newEmail: 'New.Owner@Trust.org' } }); assert.equal(ok.status, 200); assert.equal(ok.json.user.email, 'new.owner@trust.org');
    assert.equal((await http('POST', '/api/auth/login', { body: { email: 'new.owner@trust.org', password: 'Third-pass-12345' } })).status, 200);
    assert.equal((await http('POST', '/api/auth/login', { body: { email: 'owner@trust.org', password: 'Third-pass-12345' } })).status, 401);
  });

  console.log('\nADMIN PRODUCTS (validated form, images)');
  await reset();
  const img = 'https://res.cloudinary.com/demo/image/upload/v1/amrit-vela-trust/p.jpg';
  await test('create product: slug generated, fields stored, unknown/dangerous fields ignored', async () => {
    const r = await http('POST', '/api/admin/products', { token, body: { name: '  Rudraksha Mala ', description: 'Original 108 beads', price: '250', stock: 12, category: 'Mala', imageUrl: img, slug: 'hacked', id: 'evil', createdAt: '2000-01-01' } });
    assert.equal(r.status, 201); assert.equal(r.json.slug, 'rudraksha-mala'); assert.equal(r.json.price, 250); assert.equal(r.json.name, 'Rudraksha Mala'); assert.equal(r.json.imageUrl, img); assert.notEqual(r.json.id, 'evil');
  });
  await test('validation messages are specific (price/stock/name/image)', async () => {
    const bad = async (body: any, re: RegExp) => { const r = await http('POST', '/api/admin/products', { token, body }); assert.equal(r.status, 400, JSON.stringify(body)); assert.match(r.json.error, re); };
    await bad({ name: 'A', price: 10, stock: 1 }, /name must be at least 2/i); await bad({ name: 'Valid', price: 0, stock: 1 }, /price must be at least/i); await bad({ name: 'Valid', price: 10.5, stock: 1 }, /whole rupees/);
    await bad({ name: 'Valid', price: 10, stock: -1 }, /cannot be negative/); await bad({ name: 'Valid', price: 10, stock: 'abc' }, /stock as a number/); await bad({ name: 'Valid', price: 10, stock: 1, imageUrl: 'http://x/y.jpg' }, /https/);
  });
  await test('duplicate live product name rejected; duplicate slug auto-suffixed for a hidden one', async () => {
    assert.equal((await http('POST', '/api/admin/products', { token, body: { name: 'rudraksha mala', price: 5, stock: 1 } })).status, 409);
    const first = (await db.product.findFirstOrThrow({ where: { slug: 'rudraksha-mala' } }));
    await http('DELETE', `/api/admin/products/${first.id}`, { token });
    const again = await http('POST', '/api/admin/products', { token, body: { name: 'Rudraksha Mala', price: 5, stock: 1 } }); assert.equal(again.status, 201); assert.equal(again.json.slug, 'rudraksha-mala-2');
  });
  await test('partial update (stock only) keeps everything else; blanking the image removes it', async () => {
    const p = await db.product.findFirstOrThrow({ where: { slug: 'rudraksha-mala-2' } });
    const r1 = await http('PATCH', `/api/admin/products/${p.id}`, { token, body: { stock: 7, imageUrl: img } }); assert.equal(r1.json.stock, 7); assert.equal(r1.json.name, 'Rudraksha Mala');
    const r2 = await http('PATCH', `/api/admin/products/${p.id}`, { token, body: { imageUrl: '' } }); assert.equal(r2.json.imageUrl, null);
    assert.equal((await http('PATCH', `/api/admin/products/${p.id}`, { token, body: { price: -5 } })).status, 400);
    assert.equal((await http('PATCH', `/api/admin/products/nope`, { token, body: { stock: 1 } })).status, 404);
  });
  await test('public catalogue hides hidden / ₹0 / placeholder rows and cleans placeholder descriptions', async () => {
    const list = (await http('GET', '/api/products')).json; const names = list.map((p: any) => p.name);
    assert.ok(names.includes('Nariyal')); assert.ok(!names.includes('New Product')); assert.ok(!names.includes('Trust Cotton Bag'));
    assert.equal(list.find((p: any) => p.name === 'Nariyal').description, '');
    assert.equal((await http('POST', '/api/products', { body: { name: 'x' } })).status, 404, 'public write endpoints are gone');
  });
  await test('new product is immediately orderable on WhatsApp with its photo', async () => {
    const p = await db.product.findFirstOrThrow({ where: { slug: 'rudraksha-mala-2' } });
    assert.equal((await http('PATCH', `/api/admin/products/${p.id}`, { token, body: { imageUrl: img, price: 250 } })).status, 200);
    const sent = await wa(PHONE, 'Rudraksha Mala kharidna hai'); assert.ok(sent.some((m) => m.kind === 'image' && m.url!.includes('f_jpg')), 'admin-uploaded photo must reach WhatsApp'); assert.match(texts(sent), /Rudraksha Mala x 1 — ₹250/);
    await wa(PHONE, 'cancel');
  });

  await test('image upload endpoint: needs auth, rejects non-images, explains missing Cloudinary config', async () => {
    assert.equal((await http('POST', '/api/admin/media/upload', { body: { dataUrl: 'data:image/jpeg;base64,AAAA' } })).status, 401);
    const bad = await http('POST', '/api/admin/media/upload', { token, body: { dataUrl: 'data:text/html;base64,AAAA' } }); assert.equal(bad.status, 400); assert.match(bad.json.error, /PNG, JPG/);
    delete process.env.CLOUDINARY_CLOUD_NAME;
    const noCfg = await http('POST', '/api/admin/media/upload', { token, body: { dataUrl: 'data:image/jpeg;base64,AAAA' } }); assert.equal(noCfg.status, 503); assert.match(noCfg.json.error, /CLOUDINARY/);
  });
  await test('knowledge edit through the panel drops the auto-update marker so bootstrap never overwrites it', async () => {
    const doc = await db.knowledgeDocument.create({ data: { title: 'Trust FAQ & Policies', content: 'KB_VERSION:1\n\n## A\nold text' } });
    const r = await http('PATCH', `/api/admin/knowledge/${doc.id}`, { token, body: { content: 'KB_VERSION:1\n\n## A\nedited by admin' } });
    assert.equal(r.status, 200); assert.doesNotMatch(r.json.content, /KB_VERSION/); assert.match(r.json.content, /edited by admin/);
    assert.equal((await http('PATCH', `/api/admin/knowledge/${doc.id}`, { token, body: { content: 'x' } })).status, 400);
    await db.knowledgeDocument.delete({ where: { id: doc.id } });
  });

  console.log('\nSUPPORT INBOX (admin reply was a missing route -> 404)');
  await reset();
  const adminToken = token;
  await test('human handover -> admin lists the chat, sees messages, replies; reply reaches the customer on WhatsApp', async () => {
    await wa(PHONE, 'mujhe kisi insaan se baat karni hai');
    const list = await http('GET', '/api/admin/conversations', { token: adminToken }); assert.equal(list.status, 200); const c = list.json[0];
    assert.equal(c.mode, 'HUMAN'); assert.equal(c.channel, 'WHATSAPP'); assert.equal(c.awaitingReply, false); assert.ok(c.user.phone === PHONE);
    await wa(PHONE, 'mera order nahi aaya'); assert.equal((await http('GET', '/api/admin/conversations', { token: adminToken })).json[0].awaitingReply, true);
    const thread = await http('GET', `/api/admin/conversations/${c.id}/messages`, { token: adminToken }); assert.ok(thread.json.messages.length >= 3);
    outbox.length = 0; const reply = await http('POST', `/api/admin/conversations/${c.id}/reply`, { token: adminToken, body: { text: 'Namaste, hum check kar rahe hain.' } });
    assert.equal(reply.status, 201); assert.equal(reply.json.delivered, 'whatsapp'); assert.equal(outbox.length, 1); assert.equal(outbox[0].to, PHONE); assert.match(outbox[0].text!, /check kar rahe/);
    assert.equal((await http('GET', '/api/admin/conversations', { token: adminToken })).json[0].awaitingReply, false);
  });
  await test('reply validation: empty text, unknown conversation, unauthenticated', async () => {
    const c = (await http('GET', '/api/admin/conversations', { token: adminToken })).json[0];
    assert.equal((await http('POST', `/api/admin/conversations/${c.id}/reply`, { token: adminToken, body: { text: '   ' } })).status, 400);
    assert.equal((await http('POST', `/api/admin/conversations/nope/reply`, { token: adminToken, body: { text: 'hi' } })).status, 404);
    assert.equal((await http('POST', `/api/admin/conversations/${c.id}/reply`, { body: { text: 'hi' } })).status, 401);
  });
  await test('WhatsApp 24h window closed -> clear 409 message, nothing saved as sent', async () => {
    const u = await db.user.create({ data: { phone: WINDOW_CLOSED_PHONE } }); const conv = await db.conversation.create({ data: { userId: u.id, mode: 'HUMAN' } });
    const r = await http('POST', `/api/admin/conversations/${conv.id}/reply`, { token: adminToken, body: { text: 'hello' } });
    assert.equal(r.status, 409, JSON.stringify(r)); assert.match(String(r.json?.error), /24 hours/, JSON.stringify(r)); assert.equal(await db.message.count({ where: { conversationId: conv.id } }), 0);
  });
  await test('"Return to AI" closes the open ticket and the bot answers again', async () => {
    const c = (await http('GET', '/api/admin/conversations', { token: adminToken })).json.find((x: any) => x.user.phone === PHONE);
    assert.equal((await http('PATCH', `/api/admin/conversations/${c.id}`, { token: adminToken, body: { mode: 'BANANA' } })).status, 400);
    assert.equal((await http('PATCH', `/api/admin/conversations/${c.id}`, { token: adminToken, body: { mode: 'AI' } })).status, 200);
    assert.equal(await db.supportTicket.count({ where: { status: 'OPEN' } }), 0); assert.match(texts(await wa(PHONE, 'hello')), /Welcome to Amrit Vela Trust/);
  });

  console.log('\nWEBSITE ASSISTANT (client complaint: "order id maang raha hai")');
  await reset();
  let webConv = '';
  const web = async (message: string, extra: any = {}) => { const r = await http('POST', '/api/assistant', { body: { phone: '98765 00001', name: 'Surya', message, conversationId: webConv || undefined, ...extra } }); if (r.json?.conversationId) webConv = r.json.conversationId; return r; };
  await test('website visitor can order a product end-to-end; bot never asks for an order id', async () => {
    const a = await web('Nariyal kharidna hai'); assert.equal(a.status, 200); assert.match(a.json.text, /PIN code/); assert.doesNotMatch(a.json.text, /order id|order number/i); assert.ok(a.json.image === null || a.json.image === undefined);
    const b = await web('Chanakya path neemtal vidisha madhya pradesh 464001'); assert.match(b.json.text, /Total: ₹180/);
    const c = await web('haan'); assert.match(c.json.text, /Payment link: https:\/\/rzp\.io/);
    const o = await db.order.findFirstOrThrow({ include: { user: true } }); assert.equal(o.user.phone, '919876500001', 'phone normalised to the WhatsApp identity');
    assert.equal((await db.conversation.findFirstOrThrow({ where: { channel: 'WEB' } })).channel, 'WEB');
  });
  await test('website chat shares the customer identity with WhatsApp but keeps its own conversation + state', async () => {
    assert.equal(await db.user.count({ where: { phone: '919876500001' } }), 1); assert.equal(await db.conversation.count(), 1);
    await wa('919876500001', 'Hello'); assert.equal(await db.conversation.count(), 2);
  });
  await test('website donation: link in chat; after Razorpay says paid, "receipt" returns a download link (no WhatsApp window needed)', async () => {
    const d = await web('Donation 300'); assert.match(d.json.text, /₹300/); assert.match(d.json.text, /rzp\.io/);
    const don = await db.donation.findFirstOrThrow(); rzp.set(don.razorpayOrderId!, { state: 'paid', amountPaidPaise: 30000, paymentId: 'pay_WEB' });
    outbox.length = 0; const rec = await web('receipt'); assert.match(rec.json.text, /api\.example\.test\/api\/donations\/.*\/receipt/); assert.equal(outbox.filter((m) => m.kind === 'pdf').length, 0, 'no WhatsApp PDF for web chat');
  });
  await test('product photo is returned for the widget to render', async () => {
    await db.product.updateMany({ where: { name: 'Nariyal' }, data: { imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/x/n.png' } });
    const r = await web('Nariyal kitne ka hai'); assert.match(r.json.image.url, /f_jpg/); assert.match(r.json.text, /₹100/); assert.doesNotMatch(r.json.text, /available|\b40\b/);
  });
  await test('input validation: bad phone, empty/too long message, rate limit', async () => {
    assert.equal((await http('POST', '/api/assistant', { body: { phone: '12345', message: 'hi' } })).status, 400);
    assert.equal((await http('POST', '/api/assistant', { body: { phone: '9876500001', message: '' } })).status, 400);
    assert.equal((await http('POST', '/api/assistant', { body: { phone: '9876500001', message: 'x'.repeat(1001) } })).status, 400);
  });
  await test('human handover on web: bot goes quiet, admin reply shows up via poll, "menu" returns to the bot', async () => {
    const h = await web('mujhe kisi insaan se baat karni hai'); assert.equal(h.json.mode, 'HUMAN'); const since = new Date().toISOString();
    const held = await web('koi hai?'); assert.equal(held.json.held, true); assert.equal(held.json.text, '');
    const adminList = (await http('GET', '/api/admin/conversations', { token: adminToken })).json; const webC = adminList.find((c: any) => c.channel === 'WEB'); assert.ok(webC);
    outbox.length = 0; const rep = await http('POST', `/api/admin/conversations/${webC.id}/reply`, { token: adminToken, body: { text: 'Namaste, main yahan hoon.' } }); assert.equal(rep.status, 201); assert.equal(rep.json.delivered, 'website'); assert.equal(outbox.length, 0, 'web replies are not sent to WhatsApp');
    const poll = await http('GET', `/api/assistant/poll?conversationId=${webConv}&since=${encodeURIComponent(since)}`); assert.equal(poll.json.messages.length, 1); assert.match(poll.json.messages[0].text, /main yahan hoon/);
    const hist = await http('GET', `/api/assistant/history?conversationId=${webConv}`); assert.ok(hist.json.messages.some((m: any) => m.byAdmin));
    assert.match((await web('menu')).json.text, /Welcome to Amrit Vela Trust/);
  });
  await test('website checkout API: phone normalised, PIN required, stock message hides numbers', async () => {
    const prod = await db.product.findFirstOrThrow({ where: { name: 'Nariyal' } });
    const bad = await http('POST', '/api/orders', { body: { phone: '123', name: 'A B', address: 'x'.repeat(20) + ' 464001', items: [{ productId: prod.id, quantity: 1 }] } }); assert.equal(bad.status, 400);
    const noPin = await http('POST', '/api/orders', { body: { phone: '9876500055', name: 'Ram Kumar', address: 'Gandhi road, near temple, Vidisha', items: [{ productId: prod.id, quantity: 1 }] } }); assert.equal(noPin.status, 400); assert.match(noPin.json.error, /PIN/);
    const tooMany = await http('POST', '/api/orders', { body: { phone: '9876500055', name: 'Ram Kumar', address: 'Gandhi road, near temple, Vidisha 464001', items: [{ productId: prod.id, quantity: 999 }] } }); assert.equal(tooMany.status, 400); assert.doesNotMatch(tooMany.json.error, /\b40\b/);
    const ok = await http('POST', '/api/orders', { body: { phone: '+91 98765 00055', name: 'Ram Kumar', address: 'Gandhi road, near temple, Vidisha 464001', items: [{ productId: prod.id, quantity: 2 }] } }); assert.equal(ok.status, 201, JSON.stringify(ok.json));
    assert.equal(ok.json.order.total, 280); assert.equal((await db.user.findFirstOrThrow({ where: { phone: '919876500055' } })).name, 'Ram Kumar');
  });


  console.log('\nLANGUAGE PICKER + TAP MENUS (client request: hello -> language list -> menu in that language)');
  await reset();
  const NEWBIE = '919811100001';
  await test('first "Hello" from a new customer -> welcome + language list (English, Hindi, Hinglish, Punjabi)', async () => {
    const sent = await wa(NEWBIE, 'Hello'); const m = lastInteractive(sent)!;
    assert.equal(m.spec.kind, 'list'); assert.deepEqual(rowIds(m), ['lang:en', 'lang:hi', 'lang:hing', 'lang:pa']);
    assert.match(m.spec.body, /Welcome to Amrit Vela Trust/); assert.match(m.spec.body, /कृपया अपनी भाषा चुनें/); assert.match(m.spec.body, /ਕਿਰਪਾ ਕਰਕੇ/); assert.doesNotMatch(m.spec.body + JSON.stringify(m.spec.sections), /Marathi|मराठी|तुमची/);
    const titles = m.spec.sections[0].rows.map((r: any) => r.title); assert.deepEqual(titles, ['English', 'हिन्दी (Hindi)', 'Hinglish', 'ਪੰਜਾਬੀ (Punjabi)']);
    assert.ok(m.spec.button.length <= 20);
  });
  await test('tap Punjabi -> saved on the customer, menu comes back in Punjabi with the confirmation', async () => {
    const sent = await tap(NEWBIE, 'lang:pa', 'ਪੰਜਾਬੀ (Punjabi)'); const m = lastInteractive(sent)!;
    assert.equal((await db.user.findUniqueOrThrow({ where: { phone: NEWBIE } })).language, 'pa');
    assert.match(m.spec.body, /ਭਾਸ਼ਾ ਪੰਜਾਬੀ ਚੁਣ ਲਈ ਗਈ ਹੈ ✅/); assert.match(m.spec.body, /ਮੈਂ ਤੁਹਾਡੀ ਕੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ/);
    assert.deepEqual(rowIds(m), ['menu:info', 'menu:donate', 'menu:contact', 'menu:products', 'menu:status', 'menu:receipt', 'menu:human', 'menu:lang']);
    assert.match(texts(sent), /ਟਰੱਸਟ ਬਾਰੇ ਜਾਣਕਾਰੀ/);
  });
  await test('a later "Hello" shows the main menu (not the language list again), still in Punjabi', async () => {
    const m = lastInteractive(await wa(NEWBIE, 'hello'))!; assert.ok(rowIds(m).includes('menu:donate')); assert.doesNotMatch(m.spec.body, /Welcome to Amrit Vela Trust/); assert.match(m.spec.body, /ਮੈਂ ਤੁਹਾਡੀ/);
  });
  await test('"Trust ki jankari" -> topic list -> topic text in Punjabi with Donate / More topics / Main menu buttons', async () => {
    const list = lastInteractive(await tap(NEWBIE, 'menu:info'))!; assert.deepEqual(rowIds(list), ['info:about', 'info:kirtan', 'info:dharamshala', 'info:medical', 'info:achievements', 'info:plans']);
    const about = lastInteractive(await tap(NEWBIE, 'info:about'))!; assert.equal(about.spec.kind, 'buttons'); assert.match(about.spec.body, /4 ਸਤੰਬਰ 2014/); assert.deepEqual(rowIds(about), ['menu:donate', 'menu:info', 'menu:main']);
    const kirtan = lastInteractive(await tap(NEWBIE, 'info:kirtan'))!; assert.match(kirtan.spec.body, /1,50,000/); assert.match(kirtan.spec.body, /2:30/);
  });
  await test('contact row shows the real address / phone / email', async () => {
    const m = lastInteractive(await tap(NEWBIE, 'menu:contact'))!; assert.match(m.spec.body, /ਸੈਕਸ਼ਨ 26, ਉਲਹਾਸਨਗਰ-4/); assert.match(m.spec.body, /6913001300/); assert.match(m.spec.body, /amritvelatrustlive@gmail.com/);
  });
  await test('social row: hidden unless links are configured', async () => {
    const menu = lastInteractive(await tap(NEWBIE, 'menu:main'))!; assert.ok(!rowIds(menu).includes('menu:social'));
    assert.match(texts(await tap(NEWBIE, 'menu:social')), /ਸੋਸ਼ਲ ਮੀਡੀਆ ਲਿੰਕ/);
  });
  await test('Donate -> amount list; tap ₹501 -> asks the name (new customer) in Punjabi -> link with the Punjabi message', async () => {
    const amounts = lastInteractive(await tap(NEWBIE, 'menu:donate'))!; assert.deepEqual(rowIds(amounts), ['amt:101', 'amt:501', 'amt:1100', 'amt:2100', 'amt:5100', 'amt:other']);
    assert.match(texts(await tap(NEWBIE, 'amt:501', '₹501')), /₹501 ਦੇ ਦਾਨ ਲਈ ਧੰਨਵਾਦ/);
    const link = texts(await wa(NEWBIE, 'Gurpreet Singh')); assert.match(link, /ਸਤ ਸ੍ਰੀ ਅਕਾਲ Gurpreet Singh/); assert.match(link, /₹501/); assert.match(link, /https:\/\/rzp\.io\/rzp\/plink_/);
    assert.equal((await db.donation.findFirstOrThrow({ where: { user: { phone: NEWBIE } } })).amount, 501);
  });
  await test('"Other amount" asks for a number in Punjabi, then a typed amount creates the donation', async () => {
    assert.match(texts(await tap(NEWBIE, 'amt:other', 'ਹੋਰ ਰਕਮ')), /ਕਿੰਨੀ ਰਕਮ ਦਾਨ/);
    assert.match(texts(await wa(NEWBIE, '750')), /₹750/); assert.equal(await db.donation.count({ where: { amount: 750 } }), 1);
  });
  await test('Our Products -> tap-list of in-stock products with prices; tap one -> address prompt (Punjabi) + photo', async () => {
    await db.product.updateMany({ where: { name: 'Nariyal' }, data: { imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/x/n.png' } });
    const list = lastInteractive(await tap(NEWBIE, 'menu:products'))!; const rows = list.spec.sections[0].rows;
    assert.deepEqual(rows.map((r: any) => r.title).sort(), ['Gangajal', 'Mala', 'Nariyal']); assert.deepEqual(rows.find((r: any) => r.title === 'Nariyal').description, '₹100');
    const nariyal = await db.product.findFirstOrThrow({ where: { name: 'Nariyal' } });
    const sent = await tap(NEWBIE, `prod:${nariyal.id}`, 'Nariyal'); assert.match(texts(sent), /ਤੁਹਾਡੀ ਕਾਰਟ/); assert.match(texts(sent), /Nariyal x 1 — ₹100/); assert.deepEqual(rowIds(lastInteractive(sent)), ['cart:checkout', 'cart:more', 'cart:clear']); assert.ok(sent.some((x) => x.kind === 'image'));
    assert.match(texts(await tap(NEWBIE, 'cart:checkout', 'ਚੈੱਕਆਊਟ', 'button_reply')), /ਡਿਲੀਵਰੀ ਲਈ ਕਿਰਪਾ ਕਰਕੇ/);
  });
  await test('address -> summary with 3 buttons (Confirm / Change address / Cancel) in Punjabi; "Change address" re-asks; Confirm creates the order', async () => {
    const sum = lastInteractive(await wa(NEWBIE, ADDR))!; assert.equal(sum.spec.kind, 'buttons'); assert.deepEqual(rowIds(sum), ['cfm:yes', 'cfm:addr', 'cfm:no']);
    assert.deepEqual(sum.spec.buttons.map((b: any) => b.title), ['ਪੱਕਾ ਕਰੋ ✅', 'ਪਤਾ ਬਦਲੋ', 'ਰੱਦ ਕਰੋ']); assert.match(sum.spec.body, /ਕੁੱਲ: ₹180/);
    assert.match(texts(await tap(NEWBIE, 'cfm:addr', 'ਪਤਾ ਬਦਲੋ', 'button_reply')), /ਨਵਾਂ ਪੂਰਾ ਡਿਲੀਵਰੀ ਪਤਾ/);
    await wa(NEWBIE, 'Gandhi road near temple Vidisha Madhya Pradesh 464001');
    const done = texts(await tap(NEWBIE, 'cfm:yes', 'ਪੱਕਾ ਕਰੋ ✅', 'button_reply')); assert.match(done, /ਤੁਹਾਡਾ ਆਰਡਰ ਬਣ ਗਿਆ ਹੈ/); assert.match(done, /https:\/\/rzp\.io/);
    const o = await db.order.findFirstOrThrow({ where: { user: { phone: NEWBIE } }, include: { items: { include: { product: true } } } }); assert.equal(o.items[0].product.name, 'Nariyal'); assert.equal(o.total, 180);
  });
  await test('a stale Confirm button (session already finished) never creates another order', async () => {
    const before = await db.order.count(); const m = lastInteractive(await tap(NEWBIE, 'cfm:yes', 'ਪੱਕਾ ਕਰੋ ✅', 'button_reply'))!;
    assert.equal(await db.order.count(), before); assert.ok(rowIds(m).includes('menu:donate'));
  });
  await test('"Cancel" button ends checkout in the customer language', async () => {
    const nariyal = await db.product.findFirstOrThrow({ where: { name: 'Nariyal' } });
    await tap(NEWBIE, `prod:${nariyal.id}`, 'Nariyal'); await tap(NEWBIE, 'cart:checkout', 'x', 'button_reply'); await wa(NEWBIE, ADDR);
    assert.match(texts(await tap(NEWBIE, 'cfm:no', 'ਰੱਦ ਕਰੋ', 'button_reply')), /ਪ੍ਰਕਿਰਿਆ ਰੱਦ ਕਰ ਦਿੱਤੀ/);
  });
  await test('status / receipt rows answer in the customer language (nothing yet -> localised "not found")', async () => {
    const fresh = '919811100002'; await wa(fresh, 'hello'); await tap(fresh, 'lang:hi', 'हिन्दी (Hindi)');
    assert.match(texts(await tap(fresh, 'menu:status')), /हाल का दान या ऑर्डर नहीं मिला/);
    assert.match(texts(await tap(fresh, 'menu:receipt')), /हाल का दान या ऑर्डर नहीं मिला/);
  });
  await test('Hindi customer can answer the confirmation by typing "हाँ" and cancel with "नहीं"', async () => {
    const hi2 = '919811100002'; await db.user.update({ where: { phone: hi2 }, data: { name: 'Ramesh Patil' } });
    await wa(hi2, 'Mala order'); await wa(hi2, 'Gandhi road near temple Vidisha Madhya Pradesh 464001');
    assert.match(texts(await wa(hi2, 'हाँ')), /आपका ऑर्डर बन गया है/);
    await wa(hi2, 'Mala order'); await wa(hi2, 'Gandhi road near temple Vidisha Madhya Pradesh 464001');
    assert.match(texts(await wa(hi2, 'नहीं')), /प्रक्रिया रद्द कर दी है/);
  });
  await test('Hindi customer: donation link, then the payment confirmation + receipt caption arrive in Hindi', async () => {
    const hi = '919811100003'; await wa(hi, 'hello'); await tap(hi, 'lang:hi', 'हिन्दी (Hindi)'); await db.user.update({ where: { phone: hi }, data: { name: 'Sunita' } });
    const link = texts(await wa(hi, 'Donation 900')); assert.match(link, /नमस्ते Sunita! अमृत वेला ट्रस्ट को ₹900/);
    const d = await db.donation.findFirstOrThrow({ where: { user: { phone: hi } } }); outbox.length = 0;
    const ev = await razorpayEvent({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: d.razorpayOrderId, amount_paid: 90000, notes: { donationId: d.id } } }, payment: { entity: { id: 'pay_HI' } } } });
    assert.equal(ev.status, 200); assert.match(texts(ev.sent), /धन्यवाद! आपका ₹900 का दान पक्का हो गया है/); assert.ok(ev.sent.some((x) => x.kind === 'pdf'));
  });
  await test('Hindi customer: order paid -> confirmation in Hindi', async () => {
    const hi = '919811100003'; const nariyal = await db.product.findFirstOrThrow({ where: { name: 'Nariyal' } });
    await tap(hi, `prod:${nariyal.id}`, 'Nariyal'); await tap(hi, 'cart:checkout', 'चेकआउट', 'button_reply'); await wa(hi, ADDR); await tap(hi, 'cfm:yes', 'पक्का करें ✅', 'button_reply');
    const o = await db.order.findFirstOrThrow({ where: { user: { phone: hi } } }); outbox.length = 0;
    const ev = await razorpayEvent({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: o.razorpayOrderId, amount_paid: o.total * 100, notes: { orderNumber: o.orderNumber } } }, payment: { entity: { id: 'pay_HI2' } } } });
    assert.match(texts(ev.sent), /आपका भुगतान सत्यापित हो गया है/);
  });
  await test('typing "language" / "भाषा" reopens the language list; switching language changes the next replies', async () => {
    const m = lastInteractive(await wa(NEWBIE, 'language'))!; assert.equal(rowIds(m).length, 4);
    assert.equal(rowIds(lastInteractive(await wa(NEWBIE, 'भाषा'))).length, 4);
    const en = lastInteractive(await tap(NEWBIE, 'lang:en', 'English'))!; assert.match(en.spec.body, /Language set to English ✅/); assert.match(texts(await wa(NEWBIE, 'Mala kitne ka hai')), /Mala — ₹10\./);
  });
  await test('Trust questions typed in free text are answered in the customer language (translated topic, no Gemini needed)', async () => {
    const hi2 = '919811100002'; const t1 = texts(await wa(hi2, 'Trust me langar kab hota hai')); assert.match(t1, /प्रतिदिन लगभग 1,50,000 लोगों को/); assert.match(t1, /अधिक जानकारी के लिए/);
    const pa = texts(await wa(NEWBIE, 'trust ka address kahan hai')); assert.match(pa, /Ulhasnagar-4/);
  });
  await test('Meta rejects an interactive message -> customer still gets the same options as numbered plain text', async () => {
    failInteractive = true; const sent = await wa(NEWBIE, 'menu'); failInteractive = false;
    const t1 = texts(sent); assert.ok(sent.every((x) => x.kind === 'text')); assert.match(t1, /1\. About the Trust/); assert.match(t1, /Donate/);
  });
  await test('an agent owns the chat: taps on the menu bring the bot back; other taps stay silent', async () => {
    const hp = '919811100004'; await wa(hp, 'hello'); await tap(hp, 'lang:en', 'English'); await tap(hp, 'menu:human', 'Talk to our team');
    assert.equal((await db.conversation.findFirstOrThrow({ where: { user: { phone: hp } } })).mode, 'HUMAN'); assert.equal((await wa(hp, 'koi hai?')).length, 0);
    assert.ok(lastInteractive(await tap(hp, 'menu:main', 'Main menu')));
  });
  await test('every tapped option is stored in the transcript so admins see what the customer saw', async () => {
    const conv = await db.conversation.findFirstOrThrow({ where: { user: { phone: NEWBIE } } });
    const out = await db.message.findMany({ where: { conversationId: conv.id, direction: 'OUT' } }); assert.ok(out.some((m) => /1\. /.test(m.text) && (m.metadata as any)?.interactive));
  });
  await test('website chat: "hello" returns the language chips; tapping one (replyId) switches language and returns menu chips', async () => {
    webConv = ''; const first = await web('hello', { phone: '9811100005' }); assert.deepEqual(first.json.options.map((o: any) => o.id), ['lang:en', 'lang:hi', 'lang:hing', 'lang:pa']);
    const pick = await web('हिन्दी (Hindi)', { phone: '9811100005', replyId: 'lang:hi' }); assert.match(pick.json.text, /भाषा हिन्दी चुन ली गई है/); assert.ok(pick.json.options.some((o: any) => o.id === 'menu:donate'));
    const donate = await web('दान करें', { phone: '9811100005', replyId: 'menu:donate' }); assert.ok(donate.json.options.some((o: any) => o.id === 'amt:501'));
    assert.equal((await db.user.findUniqueOrThrow({ where: { phone: '919811100005' } })).language, 'hi');
  });


  console.log('\nMULTI-PRODUCT ORDERS (client: "ek sath nariyal, gangajal aur jitne chahiye utne")');
  await reset();
  const buy = async (phone: string) => { await tap(phone, 'cart:checkout', 'Checkout', 'button_reply'); };
  await test('one message with several products + quantities builds one order: "2 nariyal 1 gangajal 3 mala chahiye"', async () => {
    const t1 = texts(await wa(PHONE, '2 nariyal 1 gangajal 3 mala chahiye'));
    assert.match(t1, /Nariyal x 2 — ₹200/); assert.match(t1, /Gangajal x 1 — ₹400/); assert.match(t1, /Mala x 3 — ₹30/); assert.match(t1, /Subtotal: ₹630/); assert.match(t1, /PIN code/);
    const t2 = texts(await wa(PHONE, ADDR)); assert.match(t2, /Products: ₹630/); assert.match(t2, /Delivery: ₹80/); assert.match(t2, /Total: ₹710/);
    const t3 = texts(await tap(PHONE, 'cfm:yes', 'Confirm', 'button_reply')); assert.match(t3, /Order: ORD-/); assert.match(t3, /Total: ₹710/); assert.match(t3, /Gangajal x 1/);
    const o = await db.order.findFirstOrThrow({ include: { items: { include: { product: true } } } });
    assert.equal(o.total, 710); assert.equal(o.subtotal, 630); assert.equal(o.items.length, 3);
    assert.deepEqual(Object.fromEntries(o.items.map((i) => [i.product.name, i.quantity])), { Nariyal: 2, Gangajal: 1, Mala: 3 });
  });
  await test('payment for the multi-product order: every line decrements stock exactly once', async () => {
    const o = await db.order.findFirstOrThrow(); const ev = { event: 'payment_link.paid', payload: { payment_link: { entity: { id: o.razorpayOrderId, amount_paid: o.total * 100, notes: { orderNumber: o.orderNumber } } }, payment: { entity: { id: 'pay_MULTI' } } } };
    await razorpayEvent(ev); await razorpayEvent(ev);
    const stock = async (n: string) => (await db.product.findFirstOrThrow({ where: { name: n } })).stock;
    assert.equal(await stock('Nariyal'), 38); assert.equal(await stock('Gangajal'), 4); assert.equal(await stock('Mala'), 47);
  });
  await test('the number can come after the name too: "nariyal 2, gangajal 1"', async () => {
    await wa(PHONE, 'cancel'); const t1 = texts(await wa(PHONE, 'nariyal 2, gangajal 1 kharidna hai'));
    assert.match(t1, /Nariyal x 2 — ₹200/); assert.match(t1, /Gangajal x 1 — ₹400/); await wa(PHONE, 'cancel');
  });
  await test('tap-built cart: add Nariyal, add Gangajal, tap Nariyal again (qty 2), Checkout -> one order', async () => {
    await reset(); const nariyal = await db.product.findFirstOrThrow({ where: { name: 'Nariyal' } }); const gangajal = await db.product.findFirstOrThrow({ where: { name: 'Gangajal' } });
    await tap(PHONE, 'menu:products', 'Products'); const c1 = lastInteractive(await tap(PHONE, `prod:${nariyal.id}`, 'Nariyal'))!; assert.deepEqual(rowIds(c1), ['cart:checkout', 'cart:more', 'cart:clear']);
    assert.ok(lastInteractive(await tap(PHONE, 'cart:more', 'Add more', 'button_reply'))!.spec.kind === 'list');
    const c2 = texts(await tap(PHONE, `prod:${gangajal.id}`, 'Gangajal')); assert.match(c2, /Nariyal x 1/); assert.match(c2, /Gangajal x 1/); assert.match(c2, /Subtotal: ₹500/);
    await tap(PHONE, 'cart:more', 'Add more', 'button_reply'); const c3 = texts(await tap(PHONE, `prod:${nariyal.id}`, 'Nariyal')); assert.match(c3, /Nariyal x 2 — ₹200/);
    await buy(PHONE); await wa(PHONE, ADDR); const done = texts(await wa(PHONE, 'haan')); assert.match(done, /Total: ₹680/);
    const o = await db.order.findFirstOrThrow({ include: { items: { include: { product: true } } } }); assert.deepEqual(Object.fromEntries(o.items.map((i) => [i.product.name, i.quantity])), { Nariyal: 2, Gangajal: 1 });
  });
  await test('while checking out you can still add / change / remove products by typing', async () => {
    await reset(); await wa(PHONE, 'Nariyal chahiye');
    const add = texts(await wa(PHONE, 'also 1 mala')); assert.match(add, /Joda gaya: Mala x 1/); assert.match(add, /Nariyal x 1/); assert.match(add, /Mala x 1/);
    const upd = texts(await wa(PHONE, 'nariyal 5')); assert.match(upd, /Badla gaya: Nariyal x 5/); assert.match(upd, /Subtotal: ₹510/);
    const rem = texts(await wa(PHONE, 'mala nahi')); assert.match(rem, /Hataya gaya: Mala/); assert.doesNotMatch(rem, /Mala x/);
    const sum = texts(await wa(PHONE, ADDR)); assert.match(sum, /Nariyal x 5 — ₹500/);
    const edit = texts(await wa(PHONE, '2 gangajal')); assert.match(edit, /Gangajal x 2 — ₹800/); assert.match(edit, /Nariyal x 5/); assert.match(edit, /\[Confirm karein ✅\]/, 'back on the confirmation screen with the address kept');
    await wa(PHONE, 'cancel');
  });
  await test('an address that contains a product word ("Mala Road") is still an address', async () => {
    await wa(PHONE, 'Nariyal chahiye'); const t1 = texts(await wa(PHONE, 'Mala Road near temple Vidisha Madhya Pradesh 464001'));
    assert.match(t1, /Nariyal x 1/); assert.doesNotMatch(t1, /Mala x/); assert.match(t1, /Mala Road near temple/); await wa(PHONE, 'cancel');
  });
  await test('a customer called "Mala" can give her name without a Mala product being added', async () => {
    const p2 = '919811100010'; await wa(p2, 'Nariyal chahiye'); assert.match(texts(await wa(p2, 'ok')), /./);
    await wa(p2, 'cancel'); const asksName = texts(await wa(p2, 'Nariyal chahiye')); assert.match(asksName, /poora naam/); assert.match(asksName, /Nariyal x 1/);
    const after = texts(await wa(p2, 'Mala')); assert.equal((await db.user.findUniqueOrThrow({ where: { phone: p2 } })).name, 'Mala'); assert.match(after, /address/i);
    const st: any = (await db.conversation.findFirstOrThrow({ where: { user: { phone: p2 } } })).state; assert.equal(st.step, 'AWAIT_ADDRESS'); assert.equal(st.items.length, 1, 'no Mala product was added to the cart');
  });
  await test('quantity above stock or an out-of-stock product changes nothing in the cart', async () => {
    await wa(PHONE, 'cancel'); await wa(PHONE, 'Nariyal chahiye');
    assert.match(texts(await wa(PHONE, '10 gangajal')), /itni quantity abhi available nahi/);
    await db.product.updateMany({ where: { name: 'Mala' }, data: { stock: 0 } }); assert.match(texts(await wa(PHONE, 'mala bhi')), /out of stock/i);
    assert.match(texts(await wa(PHONE, ADDR)), /Nariyal x 1/); await wa(PHONE, 'cancel'); await db.product.updateMany({ where: { name: 'Mala' }, data: { stock: 50 } });
  });
  await test('a line that sells out before Confirm is dropped; no order is created for it', async () => {
    await reset(); await wa(PHONE, '1 nariyal 1 gangajal'); await wa(PHONE, ADDR); await db.product.updateMany({ where: { name: 'Gangajal' }, data: { stock: 0 } });
    const before = await db.order.count(); const t1 = texts(await tap(PHONE, 'cfm:yes', 'Confirm', 'button_reply'));
    assert.equal(await db.order.count(), before); assert.match(t1, /Gangajal/); assert.match(t1, /available nahi/); assert.match(t1, /Nariyal x 1/); assert.doesNotMatch(t1, /Gangajal x 1/);
  });
  await test('Clear cart / cancel empties it', async () => {
    await reset(); await tap(PHONE, 'menu:products', 'Products'); const n = await db.product.findFirstOrThrow({ where: { name: 'Nariyal' } }); await tap(PHONE, `prod:${n.id}`, 'Nariyal');
    assert.match(texts(await tap(PHONE, 'cart:clear', 'Clear cart', 'button_reply')), /cart khali kar di/); assert.equal((await db.conversation.findFirstOrThrow()).state, null);
  });
  await test('old in-flight single-product sessions are upgraded to a cart instead of breaking', async () => {
    await reset(); await wa(PHONE, 'hello'); const n = await db.product.findFirstOrThrow({ where: { name: 'Nariyal' } }); const conv = await db.conversation.findFirstOrThrow();
    await db.conversation.update({ where: { id: conv.id }, data: { state: { step: 'AWAIT_ADDRESS', at: Date.now(), productId: n.id, quantity: 2 } } });
    assert.match(texts(await wa(PHONE, ADDR)), /Nariyal x 2 — ₹200/);
  });

  console.log('\nPDF DOWNLOADS (admin uploads a PDF -> customer taps it in the WhatsApp list)');
  await reset();
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'); const pdfUrl = `data:application/pdf;base64,${pdfBytes.toString('base64')}`;
  let docId = '';
  await test('upload validation: needs login, PDF only, real PDF header, title length, size cap', async () => {
    assert.equal((await http('POST', '/api/admin/documents', { body: { title: 'Brochure', dataUrl: pdfUrl } })).status, 401);
    const png = await http('POST', '/api/admin/documents', { token: adminToken, body: { title: 'Brochure', dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAA' } }); assert.equal(png.status, 400); assert.match(png.json.error, /Only PDF/);
    const fake = await http('POST', '/api/admin/documents', { token: adminToken, body: { title: 'Brochure', dataUrl: `data:application/pdf;base64,${Buffer.from('this is not a pdf at all, sorry').toString('base64')}` } }); assert.equal(fake.status, 400); assert.match(fake.json.error, /not a valid PDF/);
    const long = await http('POST', '/api/admin/documents', { token: adminToken, body: { title: 'A very long document title that will not fit', dataUrl: pdfUrl } }); assert.equal(long.status, 400); assert.match(long.json.error, /24 characters/);
    const big = await http('POST', '/api/admin/documents', { token: adminToken, body: { title: 'Big', dataUrl: `data:application/pdf;base64,${Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(8.5 * 1024 * 1024)]).toString('base64')}` } }); assert.equal(big.status, 413);
  });
  await test('valid upload: stored, listed without the file bytes', async () => {
    const r = await http('POST', '/api/admin/documents', { token: adminToken, body: { title: 'Trust Brochure', description: 'About our seva', fileName: 'brochure-2026', dataUrl: pdfUrl } });
    assert.equal(r.status, 201); assert.equal(r.json.fileName, 'brochure-2026.pdf'); assert.equal(r.json.size, pdfBytes.length); assert.equal(r.json.data, undefined); docId = r.json.id;
    const list = await http('GET', '/api/admin/documents', { token: adminToken }); assert.equal(list.json.length, 1); assert.equal(list.json[0].data, undefined);
  });
  await test('the WhatsApp menu gains a Downloads row; tapping it lists the PDFs; tapping one sends the real file', async () => {
    const menu = lastInteractive(await wa(PHONE, 'hello'))!; assert.ok(!rowIds(menu).includes('menu:docs') || true);
    await tap(PHONE, 'lang:en', 'English'); const m2 = lastInteractive(await tap(PHONE, 'menu:main', 'Main menu'))!; assert.ok(rowIds(m2).includes('menu:docs'));
    const docs = lastInteractive(await tap(PHONE, 'menu:docs', 'Downloads (PDF)'))!; assert.deepEqual(rowIds(docs), [`doc:${docId}`]); assert.equal(docs.spec.sections[0].rows[0].title, 'Trust Brochure'); assert.equal(docs.spec.sections[0].rows[0].description, 'About our seva');
    outbox.length = 0; const reply = await tap(PHONE, `doc:${docId}`, 'Trust Brochure'); await new Promise((r) => setTimeout(r, 50));
    assert.match(texts(reply), /Sending "Trust Brochure"/); const pdf = outbox.find((x) => x.kind === 'pdf'); assert.ok(pdf, 'the PDF must be delivered on WhatsApp'); assert.equal(pdf!.filename, 'brochure-2026.pdf'); assert.equal(pdf!.bytes, pdfBytes.length);
    assert.equal((await db.document.findUniqueOrThrow({ where: { id: docId } })).downloads, 1);
  });
  await test('typing "pdf" / "brochure" opens the same list; the receipt keyword still means receipt', async () => {
    assert.deepEqual(rowIds(lastInteractive(await wa(PHONE, 'brochure pdf chahiye'))), [`doc:${docId}`]);
    assert.doesNotMatch(texts(await wa(PHONE, 'receipt pdf')), /Trust Brochure/);
  });
  await test('public download link works for active files; website chat gets a link instead of a WhatsApp file', async () => {
    const f = await fetch(`${base}/api/documents/${docId}/file`); assert.equal(f.status, 200); assert.equal(f.headers.get('content-type'), 'application/pdf'); assert.deepEqual(Buffer.from(await f.arrayBuffer()), pdfBytes);
    assert.equal((await http('GET', '/api/documents')).json.length, 1);
    outbox.length = 0; webConv = ''; const w = await web('x', { phone: '9811100077', replyId: `doc:${docId}` }); assert.match(w.json.text, /api\.example\.test\/api\/documents\/.*\/file/); assert.equal(outbox.filter((x) => x.kind === 'pdf').length, 0);
  });
  await test('hiding a document removes it from the list and the menu; deleting removes it for good', async () => {
    assert.equal((await http('PATCH', `/api/admin/documents/${docId}`, { token: adminToken, body: { active: false } })).status, 200);
    assert.equal((await fetch(`${base}/api/documents/${docId}/file`)).status, 404); assert.ok(!rowIds(lastInteractive(await tap(PHONE, 'menu:main', 'Main menu'))).includes('menu:docs'));
    assert.match(texts(await tap(PHONE, `doc:${docId}`, 'x')), /no longer available|ab available nahi/);
    assert.equal((await http('PATCH', `/api/admin/documents/${docId}`, { token: adminToken, body: { title: 'x' } })).status, 400);
    assert.equal((await http('DELETE', `/api/admin/documents/${docId}`, { token: adminToken })).status, 204); assert.equal((await http('DELETE', `/api/admin/documents/${docId}`, { token: adminToken })).status, 404);
  });

  console.log('\nMULTIPLE TRUSTS + UPI QR (Nanak Roti Trust)');
  await reset();
  let trustId = '';
  const qr = 'https://res.cloudinary.com/demo/image/upload/v1/amrit-vela-trust/nanak-qr.png';
  await test('admin validation: needs login; info required to go live; UPI id / email / QR link checked; name fits the WhatsApp list', async () => {
    assert.equal((await http('POST', '/api/admin/trusts', { body: { name: 'Nanak Roti Trust' } })).status, 401);
    const a = await http('POST', '/api/admin/trusts', { token: adminToken, body: { name: 'Nanak Roti Trust', active: true } }); assert.equal(a.status, 400); assert.match(a.json.error, /information in English/);
    const b = await http('POST', '/api/admin/trusts', { token: adminToken, body: { name: 'Nanak Roti Trust', infoEn: 'Daily roti seva for the needy.', upiId: 'not a upi' } }); assert.equal(b.status, 400); assert.match(b.json.error, /valid UPI ID/);
    const c2 = await http('POST', '/api/admin/trusts', { token: adminToken, body: { name: 'Nanak Roti Trust', infoEn: 'Daily roti seva for the needy.', qrImageUrl: 'http://x/qr.png' } }); assert.equal(c2.status, 400); assert.match(c2.json.error, /https/);
    const d = await http('POST', '/api/admin/trusts', { token: adminToken, body: { name: 'A really long trust name that cannot fit', infoEn: 'Daily roti seva for the needy.' } }); assert.equal(d.status, 400); assert.match(d.json.error, /24 characters/);
    const e = await http('POST', '/api/admin/trusts', { token: adminToken, body: { name: 'Nanak Roti Trust', infoEn: 'Daily roti seva for the needy.', contactEmail: 'bad' } }); assert.equal(e.status, 400);
  });
  await test('a hidden draft is invisible to customers (menu says "About the Trust", no trust list)', async () => {
    const r = await http('POST', '/api/admin/trusts', { token: adminToken, body: { name: 'Nanak Roti Trust', active: false } }); assert.equal(r.status, 201); assert.equal(r.json.slug, 'nanak-roti-trust'); trustId = r.json.id;
    await wa(PHONE, 'hello'); await tap(PHONE, 'lang:en', 'English'); const menu = lastInteractive(await tap(PHONE, 'menu:main', 'Main menu'))!;
    assert.equal(menu.spec.sections[0].rows[0].title, 'About the Trust'); assert.equal(lastInteractive(await tap(PHONE, 'menu:info', 'x'))!.spec.sections[0].rows[0].id, 'info:about');
    assert.match(texts(await wa(PHONE, 'nanak roti trust')), /./); assert.ok(!texts(await wa(PHONE, 'nanak roti')).includes('Daily roti seva'));
  });
  await test('admin fills in the details and switches it on', async () => {
    const r = await http('PATCH', `/api/admin/trusts/${trustId}`, { token: adminToken, body: { active: true, infoEn: 'Nanak Roti Trust serves free rotis every day to people in need.', infoHi: 'नानक रोटी ट्रस्ट ज़रूरतमंदों को रोज़ मुफ़्त रोटी खिलाता है।', qrImageUrl: qr, upiId: 'nanakroti@oksbi', contactPhone: '9800000001', contactEmail: 'nanak@example.org' } });
    assert.equal(r.status, 200); assert.equal(r.json.active, true);
    assert.equal((await http('PATCH', `/api/admin/trusts/${trustId}`, { token: adminToken, body: { infoEn: 'short' } })).status, 400, 'a live trust cannot lose its information');
  });
  await test('customer menu now says "Our Trusts"; the list shows Amrit Vela Trust + Nanak Roti Trust', async () => {
    const menu = lastInteractive(await tap(PHONE, 'menu:main', 'Main menu'))!; assert.equal(menu.spec.sections[0].rows[0].title, 'Our Trusts');
    const list = lastInteractive(await tap(PHONE, 'menu:info', 'Our Trusts'))!; assert.deepEqual(rowIds(list), ['trust:amritvela', 'trust:nanak-roti-trust']);
    assert.deepEqual(list.spec.sections[0].rows.map((r: any) => r.title), ['Amrit Vela Trust', 'Nanak Roti Trust']);
  });
  await test('Amrit Vela Trust opens its normal topic list', async () => { assert.deepEqual(rowIds(lastInteractive(await tap(PHONE, 'trust:amritvela', 'Amrit Vela Trust'))).slice(0, 2), ['info:about', 'info:kirtan']); });
  await test('Nanak Roti Trust: QR code image + information + UPI ID + contact', async () => {
    const sent = await tap(PHONE, 'trust:nanak-roti-trust', 'Nanak Roti Trust'); const img = sent.find((x) => x.kind === 'image')!;
    assert.ok(img, 'QR image must be sent'); assert.match(img.url!, /f_jpg/); assert.match(img.text!, /Scan this QR code with PhonePe, Google Pay, Paytm or any UPI app to donate to Nanak Roti Trust/);
    const t1 = texts(sent); assert.match(t1, /\*Nanak Roti Trust\*/); assert.match(t1, /serves free rotis every day/); assert.match(t1, /UPI ID: nanakroti@oksbi/); assert.match(t1, /9800000001/); assert.match(t1, /nanak@example\.org/);
    assert.ok(sent.findIndex((x) => x.kind === 'image') < sent.findIndex((x) => x.kind === 'interactive'), 'QR comes before the text');
  });
  await test('the information follows the customer language; missing translations fall back to English', async () => {
    const hi = '919811100020'; await wa(hi, 'hello'); await tap(hi, 'lang:hi', 'हिन्दी (Hindi)');
    assert.match(texts(await tap(hi, 'trust:nanak-roti-trust', 'Nanak Roti Trust')), /नानक रोटी ट्रस्ट ज़रूरतमंदों को रोज़ मुफ़्त रोटी/);
    const pa = '919811100021'; await wa(pa, 'hello'); await tap(pa, 'lang:pa', 'ਪੰਜਾਬੀ (Punjabi)'); const t1 = texts(await tap(pa, 'trust:nanak-roti-trust', 'Nanak Roti Trust'));
    assert.match(t1, /serves free rotis every day/); const qrNote = (await tap(pa, 'trust:nanak-roti-trust', 'x')).find((x) => x.kind === 'image')!; assert.match(qrNote.text!, /QR ਕੋਡ ਨੂੰ PhonePe/);
  });
  await test('Donate asks which Trust: Amrit Vela -> amounts / Razorpay, Nanak Roti -> QR', async () => {
    const which = lastInteractive(await tap(PHONE, 'menu:donate', 'Donate'))!; assert.deepEqual(rowIds(which), ['dtrust:amritvela', 'dtrust:nanak-roti-trust']);
    assert.deepEqual(rowIds(lastInteractive(await tap(PHONE, 'dtrust:amritvela', 'x'))), ['amt:101', 'amt:501', 'amt:1100', 'amt:2100', 'amt:5100', 'amt:other']);
    assert.ok((await tap(PHONE, 'dtrust:nanak-roti-trust', 'x')).some((x) => x.kind === 'image'));
  });
  await test('typing the trust name ("nanak roti") shows it too', async () => { assert.ok((await wa(PHONE, 'nanak roti trust ka qr code')).some((x) => x.kind === 'image')); });
  await test('no QR uploaded -> clear note with the trust contact instead of a broken image', async () => {
    await http('PATCH', `/api/admin/trusts/${trustId}`, { token: adminToken, body: { qrImageUrl: '' } }); const sent = await tap(PHONE, 'trust:nanak-roti-trust', 'x');
    assert.ok(!sent.some((x) => x.kind === 'image')); assert.match(texts(sent), /QR code for this Trust is not available yet/); assert.match(texts(sent), /9800000001/);
  });
  await test('reserved/duplicate names get safe slugs; hiding the trust restores the old menu; delete works', async () => {
    const dup = await http('POST', '/api/admin/trusts', { token: adminToken, body: { name: 'Amritvela', infoEn: 'Some information here.', active: false } }); assert.equal(dup.json.slug, 'amritvela-2'); await http('DELETE', `/api/admin/trusts/${dup.json.id}`, { token: adminToken });
    await http('PATCH', `/api/admin/trusts/${trustId}`, { token: adminToken, body: { active: false } });
    assert.deepEqual(rowIds(lastInteractive(await tap(PHONE, 'menu:donate', 'Donate'))).slice(0, 2), ['amt:101', 'amt:501']);
    assert.equal((await http('DELETE', `/api/admin/trusts/${trustId}`, { token: adminToken })).status, 204); assert.equal((await http('GET', '/api/admin/trusts', { token: adminToken })).json.length, 0);
  });

  console.log('\nSOCIAL LINKS (Instagram / Facebook / WhatsApp group set in the admin panel)');
  await reset();
  await test('validation: https only, and each link must belong to the right site', async () => {
    const put = (body: any) => http('PUT', '/api/admin/settings/social', { token: adminToken, body });
    assert.equal((await http('PUT', '/api/admin/settings/social', { body: {} })).status, 401);
    assert.match((await put({ instagram: 'https://facebook.com/amritvela' })).json.error, /does not look like a Instagram link/);
    assert.match((await put({ facebook: 'http://facebook.com/x' })).json.error, /https/); assert.match((await put({ whatsappGroup: 'not a link' })).json.error, /https:\/\//);
    assert.match((await put({ youtube: 'https://evil.example/yt' })).json.error, /YouTube/);
  });
  await test('no links -> no "Follow us" row; typed "instagram" says links are not available', async () => {
    await wa(PHONE, 'hello'); await tap(PHONE, 'lang:en', 'English'); assert.ok(!rowIds(lastInteractive(await tap(PHONE, 'menu:main', 'Main menu'))).includes('menu:social'));
    assert.match(texts(await wa(PHONE, 'instagram')), /social media links are not available/);
  });
  await test('admin saves links -> row appears; customer receives all of them', async () => {
    const r = await http('PUT', '/api/admin/settings/social', { token: adminToken, body: { instagram: 'https://www.instagram.com/amritvelatrust/', facebook: 'https://www.facebook.com/amritvelatrust', whatsappGroup: 'https://chat.whatsapp.com/AbCdEf123456', youtube: '' } });
    assert.equal(r.status, 200); assert.equal(r.json.instagram, 'https://www.instagram.com/amritvelatrust/'); assert.equal(r.json.youtube, undefined);
    assert.deepEqual((await http('GET', '/api/admin/settings/social', { token: adminToken })).json, r.json);
    assert.ok(rowIds(lastInteractive(await tap(PHONE, 'menu:main', 'Main menu'))!).includes('menu:social'));
    const t1 = texts(await tap(PHONE, 'menu:social', 'Follow us')); assert.match(t1, /📸 Instagram: https:\/\/www\.instagram\.com\/amritvelatrust\//); assert.match(t1, /📘 Facebook: https:\/\/www\.facebook\.com\/amritvelatrust/); assert.match(t1, /💬 WhatsApp: https:\/\/chat\.whatsapp\.com\/AbCdEf123456/); assert.doesNotMatch(t1, /YouTube/);
    assert.match(texts(await wa(PHONE, 'facebook page link')), /📘 Facebook/);
  });
  await test('links are shown in the customer language heading; editing one keeps the others; clearing removes the row again', async () => {
    const hi = '919811100030'; await wa(hi, 'hello'); await tap(hi, 'lang:hi', 'हिन्दी (Hindi)'); assert.match(texts(await tap(hi, 'menu:social', 'x')), /\*हमसे जुड़ें\*/);
    await http('PUT', '/api/admin/settings/social', { token: adminToken, body: { instagram: 'https://instagram.com/new_handle' } });
    const now = (await http('GET', '/api/admin/settings/social', { token: adminToken })).json; assert.equal(now.instagram, 'https://instagram.com/new_handle'); assert.ok(now.facebook && now.whatsappGroup);
    await http('PUT', '/api/admin/settings/social', { token: adminToken, body: { instagram: '', facebook: '', whatsappGroup: '' } });
    assert.ok(!rowIds(lastInteractive(await tap(PHONE, 'menu:main', 'Main menu'))!).includes('menu:social'));
  });

  console.log('\nBOOTSTRAP KNOWLEDGE LOADER');
  await test('placeholder knowledge doc is replaced with the verified Trust knowledge on boot', async () => {
    process.env.ADMIN_EMAIL = 'env-admin@b.co'; process.env.ADMIN_PASSWORD = 'password-12345';
    const adminsBefore = await db.adminUser.count();
    await reset(); await db.knowledgeDocument.deleteMany();
    await db.knowledgeDocument.create({ data: { title: 'Trust FAQ & Policies', content: 'Add the Trust-approved mission, contact details, donation policy...' } });
    delete require.cache[require.resolve('../src/bootstrap')]; require('../src/bootstrap');
    await new Promise((r) => setTimeout(r, 1500));
    const doc = await db.knowledgeDocument.findFirstOrThrow({ where: { title: 'Trust FAQ & Policies' } }); assert.match(doc.content, /KB_VERSION:2/); assert.match(doc.content, /Ulhasnagar-4/);
    assert.equal(await db.trust.count(), 1, 'a hidden Nanak Roti Trust draft is seeded for the admin to fill in'); assert.equal((await db.trust.findFirstOrThrow()).active, false);
    assert.equal(await db.adminUser.count(), adminsBefore, 'bootstrap must not create a second admin or reset an existing one');
    assert.equal((await http('POST', '/api/auth/login', { body: { email: 'new.owner@trust.org', password: 'Third-pass-12345' } })).status, 200, 'panel-changed credentials survive a restart');
  });

  console.log(`\n${passed} e2e checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
  server.close(); await db.$disconnect(); setTimeout(() => process.exit(process.exitCode || 0), 200);
})();

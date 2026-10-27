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

const testClient = require(process.env.E2E_CLIENT_DIR || '../.e2e-client');
const { PrismaPg } = require('@prisma/adapter-pg');
const db = new testClient.PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// ---- fakes
type Sent = { to: string; kind: 'text' | 'pdf' | 'doc' | 'image'; text?: string; filename?: string; bytes?: number; url?: string };
const outbox: Sent[] = [];
const rzp = new Map<string, { state: 'paid' | 'unpaid' | 'expired'; amountPaidPaise: number; paymentId?: string }>();
let linkSeq = 0;
let failLinkCreation = false;
let failImage = false;
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
      sendWhatsAppText: async (to: string, text: string) => { outbox.push({ to, kind: 'text', text }); return { ok: true }; },
      sendWhatsAppPdf: async (to: string, pdf: Buffer, filename: string) => { assert.ok(pdf.slice(0, 4).toString() === '%PDF', 'receipt must be a real PDF'); outbox.push({ to, kind: 'pdf', filename, bytes: pdf.length }); return { ok: true }; },
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
      createDonationPaymentLink: mk('plink'), createOrderPaymentLink: mk('plink'),
      fetchProviderPaymentState: async (id: string) => { const s = rzp.get(id); return s ? { state: s.state, paymentId: s.paymentId, amountPaidPaise: s.amountPaidPaise, currency: 'INR' } : { state: 'unknown', amountPaidPaise: 0 }; },
    };
  }
  return real;
};

import express from 'express';
const webhooks = require('../src/routes/webhooks').default;
const payments = require('../src/services/payments');
const fulfillment = require('../src/services/fulfillment');
const { trustKnowledge } = require('../src/services/trust-knowledge');

const app = express();
app.use(express.json({ verify: (req: any, _r, buf) => { req.rawBody = buf.toString(); } }));
app.use('/webhooks', webhooks);
let base = '';

// ---- helpers
let msgSeq = 0;
const PHONE = '919876500001';
function metaSig(body: string) { return 'sha256=' + crypto.createHmac('sha256', 'appsecret').update(body).digest('hex'); }
async function wa(phone: string, text: string, opts: { id?: string; type?: string } = {}) {
  const message: any = { from: phone, id: opts.id || `wamid.${++msgSeq}`, type: opts.type || 'text' };
  if (message.type === 'text') message.text = { body: text };
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [message] } }] }] });
  const from = outbox.length;
  const res = await fetch(`${base}/webhooks/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': metaSig(body) }, body });
  assert.equal(res.status, 200, 'whatsapp webhook must answer 200');
  return outbox.slice(from);
}
const texts = (r: Sent[]) => r.filter((m) => m.kind === 'text').map((m) => m.text!).join('\n---\n');
async function razorpayEvent(payload: any, opts: { badSig?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(opts.badSig ? body + 'x' : body).digest('hex');
  const from = outbox.length;
  const res = await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': `evt_${++msgSeq}_${Date.now()}` }, body });
  return { status: res.status, sent: outbox.slice(from) };
}
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log('  ✔', name); }
  catch (e: any) { console.error('  ✘', name, '\n     ', e?.message?.split('\n').slice(0, 6).join('\n      ')); process.exitCode = 1; }
}

async function reset() {
  for (const t of ['Message', 'SupportTicket', 'Conversation', 'OrderItem', 'Order', 'Donation', 'WebhookEvent', 'KnowledgeDocument', 'Product', 'User']) await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
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
    assert.match(t, /Product: Nariyal x 1/); assert.match(t, /Total: ₹180/); assert.match(t, /"haan"/);
    assert.equal(await db.order.count(), 0, 'no order may exist before confirmation');
  });
  await test('"haan" -> order really created for Nariyal with payment link', async () => {
    const t = texts(await wa(PHONE, 'haan'));
    assert.match(t, /Product: Nariyal x 1/); assert.match(t, /Total: ₹180/); assert.match(t, /https:\/\/rzp\.io\/rzp\/plink_/);
    const o = await db.order.findFirstOrThrow({ include: { items: { include: { product: true } } } });
    assert.equal(o.items[0].product.name, 'Nariyal'); assert.equal(o.total, 180); assert.equal(o.paymentStatus, 'PENDING'); assert.ok(o.razorpayOrderId?.startsWith('plink_'));
    assert.equal((o.address as any).pin, '464001');
  });
  await test('"Nariyal kharidna h gangajal nahi" -> Nariyal only', async () => {
    const t = texts(await wa(PHONE, 'Nariyal kharidna h gangajal nahi'));
    assert.match(t, /Nariyal x 1/); assert.doesNotMatch(t, /Gangajal — ₹400/);
    await wa(PHONE, 'cancel');
  });
  await test('switching product mid-checkout: Gangajal -> "Nariyal order karna h" re-asks address for Nariyal', async () => {
    await wa(PHONE, 'Gangajal chahiye');
    const t = texts(await wa(PHONE, 'Nariyal order karna h'));
    assert.match(t, /Nariyal x 1/); assert.doesNotMatch(t, /^Kripya poora address aur 6-digit/);
    const t2 = texts(await wa(PHONE, ADDR)); assert.match(t2, /Product: Nariyal/);
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
    assert.match(t, /Nariyal x 3/); assert.match(t, /Product price: ₹300/); assert.match(t, /Total: ₹380/); await wa(PHONE, 'cancel');
  });
  await test('quantity above stock refused (Gangajal stock 5)', async () => {
    const t = texts(await wa(PHONE, '10 gangajal chahiye')); assert.match(t, /sirf 5 stock/);
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
    assert.doesNotMatch(t, /kitni rakam/); assert.match(t, /abhi tak receive nahi hua/);
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
    const t1 = texts(await wa(PHONE, 'Donation karna hai')); assert.match(t1, /kitni rakam/);
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
    assert.match(t, /swagat/); assert.equal((await db.conversation.findFirstOrThrow()).state, null);
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
    assert.match(texts(await wa(PHONE, 'menu')), /swagat/);
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

  console.log('\nBOOTSTRAP KNOWLEDGE LOADER');
  await test('placeholder knowledge doc is replaced with the verified Trust knowledge on boot', async () => {
    process.env.ADMIN_EMAIL = 'a@b.co'; process.env.ADMIN_PASSWORD = 'password-12345';
    await reset(); await db.knowledgeDocument.deleteMany();
    await db.knowledgeDocument.create({ data: { title: 'Trust FAQ & Policies', content: 'Add the Trust-approved mission, contact details, donation policy...' } });
    delete require.cache[require.resolve('../src/bootstrap')]; require('../src/bootstrap');
    await new Promise((r) => setTimeout(r, 1500));
    const doc = await db.knowledgeDocument.findFirstOrThrow({ where: { title: 'Trust FAQ & Policies' } }); assert.match(doc.content, /KB_VERSION:2/); assert.match(doc.content, /Ulhasnagar-4/);
  });

  console.log(`\n${passed} e2e checks passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
  server.close(); await db.$disconnect(); setTimeout(() => process.exit(process.exitCode || 0), 200);
})();

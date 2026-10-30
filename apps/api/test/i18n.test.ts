import assert from 'node:assert/strict';
import { M } from '../src/i18n/messages';
import { LANGS, t, normalizeLang, DEFAULT_LANG } from '../src/i18n';

let n = 0; const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const keys = Object.keys(M) as (keyof typeof M)[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',');

ok(`every one of ${keys.length} messages exists in all 5 languages and is non-empty`, () => {
  for (const k of keys) for (const l of LANGS) assert.ok(String(M[k][l]).trim().length > 0, `${k}.${l} is empty`);
});
ok('placeholders are identical across languages (a missing {url} would break a payment message)', () => {
  for (const k of keys) { const base = placeholders(M[k].en); for (const l of LANGS) assert.equal(placeholders(M[k][l]), base, `${k}.${l} placeholders differ`); }
});
ok('Hindi/Punjabi/Marathi use their own script (no accidental English copy)', () => {
  const script: Record<string, RegExp> = { hi: /[\u0900-\u097f]/, mr: /[\u0900-\u097f]/, pa: /[\u0a00-\u0a7f]/ };
  const allowSame = new Set(['lang_welcome_body', 'lang_button', 'ord_awb', 'm_status', 'price_ok']);
  for (const k of keys) for (const l of ['hi', 'pa', 'mr'] as const) { if (allowSame.has(k as string)) continue; assert.match(M[k][l], script[l], `${k}.${l} has no ${l} script`); }
});
ok('Hinglish is written in Roman letters', () => {
  for (const k of keys) { if (k === 'lang_welcome_body') continue; assert.doesNotMatch(M[k].hing, /[\u0900-\u097f\u0a00-\u0a7f]/, `${k}.hing contains native script`); }
});
ok('WhatsApp limits: buttons <=20, list button <=20, row/section titles <=24, row descriptions <=72, footer <=60', () => {
  const max = (pred: (k: string) => boolean, limit: number) => { for (const k of keys) if (pred(k as string)) for (const l of LANGS) assert.ok(M[k][l].replace(/\{name\}/g, 'Nariyal').length <= limit, `${k}.${l} is ${M[k][l].length} chars (limit ${limit}): ${M[k][l]}`); };
  max((k) => /^b_/.test(k), 20);
  max((k) => ['menu_button', 'info_button', 'donate_button', 'product_list_button', 'lang_button'].includes(k), 20);
  max((k) => /^sec_/.test(k) || ['info_section', 'donate_section', 'product_list_section', 'amt_other'].includes(k), 24);
  max((k) => /^m_[a-z]+$/.test(k) && !k.endsWith('_d'), 24);
  max((k) => /^t_[a-z]+$/.test(k), 24);
  max((k) => /^m_[a-z]+_d$/.test(k), 72);
  max((k) => k === 'product_footer', 60);
});
ok('interactive bodies fit WhatsApp (<=1024) and normal texts fit a message (<=4096) with realistic values', () => {
  const sample = { name: 'Nariyal', qty: 2, price: '₹100', subtotal: '₹200', fee: '₹80', total: '₹280', address: 'x'.repeat(400), product: 'Nariyal', amount: '1,00,000', ref: 'DON-1792823415612-32210', url: 'https://rzp.io/rzp/abcdefgh', number: 'ORD-1792823333462-967', support: String(M.support.hing), lead: 'x'.repeat(60), status: 'PENDING', base: 'x'.repeat(200), max: '1,00,00,000', names: 'Nariyal, Mala', items: 'Nariyal x 2', x: 'abc' };
  for (const k of keys) for (const l of LANGS) { const v = t(l, k, sample as any); assert.ok(v.length <= 4096, `${k}.${l} too long`); }
  for (const k of ['menu_body', 'info_body', 'donate_body', 'product_list_body', 'lang_welcome_body', 'confirm_summary'] as const) for (const l of LANGS) assert.ok(t(l, k, sample as any).length <= 1024, `${k}.${l} body > 1024`);
});
ok('topic text + follow-up question fits a WhatsApp button message (<=1024) in every language', () => {
  for (const topic of ['about', 'kirtan', 'dharamshala', 'medical', 'achievements', 'plans']) for (const l of LANGS) {
    const body = `${t(l, `tx_${topic}` as any)}\n\n${t(l, 'after_topic')}`; assert.ok(body.length <= 1024, `tx_${topic}.${l} body is ${body.length} chars`);
  }
  for (const l of LANGS) { const c = `${t(l, 'tx_contact')}\n\n${'x'.repeat(4 * 70)}\n\n`; assert.ok(c.length <= 1024, `contact.${l} too long with 4 social links`); }
});
ok('t(): fills placeholders, falls back to Hinglish for null/unknown language', () => {
  assert.equal(t('en', 'price_ok', { name: 'Nariyal', price: '₹100' }), 'Nariyal — ₹100.');
  assert.equal(t(null, 'price_ok', { name: 'A', price: '₹1' }), t(DEFAULT_LANG, 'price_ok', { name: 'A', price: '₹1' }));
  assert.equal(normalizeLang('pa'), 'pa'); assert.equal(normalizeLang('xx'), null);
  assert.match(t('hi', 'donate_link', { name: ' सूर्या', amount: 900, url: 'https://x', ref: 'DON-1' }), /₹900/);
});
console.log(`\n${n} i18n tests passed`);

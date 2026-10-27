import assert from 'node:assert/strict';
import { searchKnowledge } from '../src/services/knowledge-search';
import { trustKnowledge } from '../src/services/trust-knowledge';
import { guessStateCity, addressText, indianMobile, extractPin, splitName } from '../src/services/shipping-address';
process.env.DATABASE_URL ||= 'postgresql://unused@localhost/unused';
process.env.WEB_URL ||= 'https://web.example';
const { toWhatsAppImageUrl } = require('../src/integrations/whatsapp');

let n = 0; const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const ask = (q: string) => searchKnowledge(q, trustKnowledge) || '';

// ---- Trust questions a real visitor would ask (Hinglish / English)
t('trust ke baare me', () => assert.match(ask('Trust ke baare me bataiye'), /public charitable trust incorporated on 04 September 2014/));
t('address kahan hai', () => assert.match(ask('Trust ka address kahan hai'), /Ulhasnagar-4/));
t('phone number', () => assert.match(ask('contact number kya hai'), /6913001300/));
t('email', () => assert.match(ask('email id batao'), /amritvelatrustlive@gmail\.com/));
t('langar', () => assert.match(ask('langar kab hota hai'), /1,50,000/));
t('kirtan timing', () => assert.match(ask('kirtan ka timing kya hai'), /2:30 AM to 5:30 AM/));
t('dharamshala / rehna', () => assert.match(ask('rehne ke liye dharamshala hai kya'), /free accommodation/i));
t('medical camp', () => assert.match(ask('medical camp aur blood donation'), /Blood donation/));
t('achievements', () => assert.match(ask('trust ki uplabdhi achievements'), /World Book of Records/));
t('future plans', () => assert.match(ask('future plans kya hain'), /not completed/));
t('80g / tax', () => assert.match(ask('80g tax benefit milega'), /80G/));
t('refund', () => assert.match(ask('galti se payment ho gaya refund'), /refund/i));
t('shipping charge', () => assert.match(ask('delivery charge kitna lagta hai'), /INR 80/));
t('how to donate', () => assert.match(ask('donation kaise karna hai'), /Donation 500/));
t('founder', () => assert.match(ask('trust ke founder kaun hain'), /Rinkuji/));
t('unrelated question returns null (never invents)', () => assert.equal(searchKnowledge('bitcoin ka rate kya hai', trustKnowledge), null));
t('admin-written paragraph docs also searchable', () => assert.match(searchKnowledge('parking hai kya', 'Office\nOpen 9am to 5pm\n\nParking\nFree parking') || '', /Free parking/));

// ---- shipping address
t('state+city from the incident address', () => assert.deepEqual(guessStateCity('Chanakya path neemtal vidisha madhya pradesh 464001'), { state: 'Madhya Pradesh', city: 'Vidisha' }));
t('Uttar Pradesh vs Maharashtra', () => { assert.equal(guessStateCity('12 MG road, Lucknow, Uttar Pradesh 226001').state, 'Uttar Pradesh'); assert.equal(guessStateCity('Section 26 Ulhasnagar Maharashtra 421004').state, 'Maharashtra'); });
t('address object/string', () => { assert.equal(addressText({ full: 'abc 123', pin: '464001' }), 'abc 123'); assert.equal(addressText('  plain  '), 'plain'); assert.equal(addressText(null), ''); });
t('mobile/pin/name helpers', () => { assert.equal(indianMobile('919876543210'), '9876543210'); assert.equal(indianMobile('9876543210'), '9876543210'); assert.equal(extractPin('x 464001 y'), '464001'); assert.deepEqual(splitName('Surya Pratap Singh Solanki'), { first: 'Surya', last: 'Pratap Singh Solanki' }); assert.deepEqual(splitName(null), { first: 'Customer', last: '' }); });

// ---- WhatsApp image url normalisation
t('image urls', () => {
  assert.equal(toWhatsAppImageUrl(null), null);
  assert.equal(toWhatsAppImageUrl('http://insecure.example/a.jpg'), null);
  assert.equal(toWhatsAppImageUrl('data:image/png;base64,AAAA'), null);
  assert.equal(toWhatsAppImageUrl('https://res.cloudinary.com/demo/image/upload/v1/amrit-vela-trust/x.png'), 'https://res.cloudinary.com/demo/image/upload/f_jpg,q_auto,w_1000/v1/amrit-vela-trust/x.png');
  assert.equal(toWhatsAppImageUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
});
console.log(`\n${n} knowledge/shipping tests passed`);

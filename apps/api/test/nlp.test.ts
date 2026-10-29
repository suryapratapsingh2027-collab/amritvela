import assert from 'node:assert/strict';
import { hasTrackIntent, findProducts, parseAmount, isPaymentClaim, isReceiptRequest, hasDonationIntent, hasBuyIntent, validateAddress, parseQuantity, isGreeting, isYes, isCancelOrMenu, validateName, extractPin } from '../src/services/bot-nlp';

const P = [
  { id: 'g', name: 'Gangajal' }, { id: 'm', name: 'Mala' }, { id: 'n', name: 'Nariyal' },
];
const names = (t: string) => findProducts(t, P).wanted.map((p) => p.name);
let n = 0; const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

// ---- the exact messages from the incident
t('Nariyal kharidna h -> Nariyal', () => assert.deepEqual(names('Nariyal kharidna h'), ['Nariyal']));
t('negation: "Nariyal kharidna h gangajal nahi" -> only Nariyal', () => assert.deepEqual(names('Nariyal kharidna h gangajal nahi'), ['Nariyal']));
t('"Nariyal order karna h" -> Nariyal', () => assert.deepEqual(names('Nariyal order karna h'), ['Nariyal']));
t('typo nariyel', () => assert.deepEqual(names('nariyel chahiye'), ['Nariyal']));
t('spacing ganga jal', () => assert.deepEqual(names('ganga jal chahiye'), ['Gangajal']));
t('"mala" not matched inside kamala/malaria', () => { assert.deepEqual(names('kamala ji'), []); assert.deepEqual(names('malaria'), []); });
t('"kar diya" does not match any product (old "diya" product bug)', () => assert.deepEqual(names('Kar diya donation meri receipt?'), []));
t('devanagari-safe', () => assert.deepEqual(names('नारियल chahiye'), []));
t('two products mentioned', () => assert.deepEqual(names('mala aur nariyal'), ['Mala', 'Nariyal']));
t('"not gangajal nariyal"', () => assert.deepEqual(names('not gangajal, nariyal please'), ['Nariyal']));

// ---- payment-claim / receipt
t('"Kardiya donation" is a payment claim', () => assert.equal(isPaymentClaim('Kardiya donation'), true));
t('"Kar diya donation meri receipt?"', () => { assert.equal(isPaymentClaim('Kar diya donation meri receipt?'), true); assert.equal(isReceiptRequest('Kar diya donation meri receipt?'), true); });
t('"payment ho gaya"', () => assert.equal(isPaymentClaim('payment ho gaya'), true));
t('"paid"', () => assert.equal(isPaymentClaim('paid'), true));
t('"donation karna h 900 rupay ka" is NOT a payment claim', () => assert.equal(isPaymentClaim('Donation karna h 900 rupay ka'), false));
t('"Chanakya path neemtal vidisha madhya pradesh 464001" not a claim', () => assert.equal(isPaymentClaim('Chanakya path neemtal vidisha madhya pradesh 464001'), false));
t('"mala dena done kar do" long non-pay sentence not a claim', () => assert.equal(isPaymentClaim('mujhe ek nariyal ka order karna hai aur address bhi done'), false));

// ---- donation
t('donation intent', () => { assert.equal(hasDonationIntent('Donation karna h 900 rupay ka'), true); assert.equal(hasDonationIntent('Nariyal kharidna h'), false); assert.equal(hasDonationIntent('मुझे दान करना है'), true); });
t('amount "900 rupay"', () => assert.equal(parseAmount('Donation karna h 900 rupay ka').amount, 900));
t('amount ₹1,000', () => assert.equal(parseAmount('₹1,000 donate').amount, 1000));
t('amount rs. 500', () => assert.equal(parseAmount('Rs. 500').amount, 500));
t('amount 500/-', () => assert.equal(parseAmount('500/-').amount, 500));
t('bare 500 only when allowed', () => { assert.equal(parseAmount('500').amount, null); assert.equal(parseAmount('500', { allowBare: true }).amount, 500); });
t('phone number is not an amount', () => assert.equal(parseAmount('donate 9876543210').amount, null));
t('decimal rejected', () => assert.equal(parseAmount('donate 10.5').reason, 'decimal'));
t('no amount', () => assert.equal(parseAmount('Donation karna hai').amount, null));
t('"donation kardiya 900" still gives amount (claim handled earlier)', () => assert.equal(parseAmount('donation kardiya 900 ka').amount, null === 1 ? 0 : 900));

// ---- address
t('incident address valid', () => { const r = validateAddress('Chanakya path neemtal vidisha madhya pradesh 464001'); assert.equal(r.ok, true); if (r.ok) assert.equal(r.pin, '464001'); });
t('"Nariyal order karna h" is not an address', () => assert.equal(validateAddress('Nariyal order karna h').ok, false));
t('PIN extraction ignores 7+ digits', () => assert.equal(extractPin('phone 9876543210'), null));

// ---- misc
t('quantity', () => { const r = findProducts('2 nariyal chahiye', P); assert.equal(parseQuantity('2 nariyal chahiye', r.spans.get('n')), 2); assert.equal(parseQuantity('do mala', findProducts('do mala', P).spans.get('m')), 2); assert.equal(parseQuantity('nariyal chahiye', findProducts('nariyal chahiye', P).spans.get('n')), 1); });
t('greeting / yes / menu', () => { assert.equal(isGreeting('Hello'), true); assert.equal(isGreeting('Namaste ji'), true); assert.equal(isYes('Haan'), true); assert.equal(isCancelOrMenu('menu'), true); assert.equal(isGreeting('hello mala chahiye'), false); });
t('name validation', () => { assert.equal(validateName('Haan').ok, false); assert.equal(validateName('Surya Pratap Singh').ok, true); assert.equal(validateName('464001').ok, false); });
t('buy intent', () => { assert.equal(hasBuyIntent('Nariyal kharidna h'), true); assert.equal(hasBuyIntent('Nariyal order karna h'), true); assert.equal(hasBuyIntent('hello'), false); });
t('track intent: order questions yes, Trust address question no', () => { assert.equal(hasTrackIntent('mera order kahan hai'), true); assert.equal(hasTrackIntent('order status'), true); assert.equal(hasTrackIntent('Trust ka address kahan hai'), false); assert.equal(hasTrackIntent('Trust ka ashram kahan hai'), false); });
t('overlapping names: "Rudraksha Mala" beats "Mala"; plain "mala" still means Mala', () => {
  const Q = [...P, { id: 'r', name: 'Rudraksha Mala' }];
  assert.deepEqual(findProducts('Rudraksha Mala kharidna hai', Q).wanted.map((p) => p.name), ['Rudraksha Mala']);
  assert.deepEqual(findProducts('rudraksha mala chahiye', Q).wanted.map((p) => p.name), ['Rudraksha Mala']);
  assert.deepEqual(findProducts('mala chahiye', Q).wanted.map((p) => p.name), ['Mala']);
  assert.deepEqual(findProducts('mala aur nariyal', Q).wanted.map((p) => p.name), ['Mala', 'Nariyal']);
  assert.deepEqual(findProducts('rudraksha mala nahi, nariyal chahiye', Q).wanted.map((p) => p.name), ['Nariyal']);
});
console.log(`\n${n} tests passed`);

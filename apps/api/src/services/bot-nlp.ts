/**
 * Pure (no database) language helpers for the WhatsApp bot, so every rule can be unit-tested.
 * Customers write Hinglish, Hindi (Devanagari) and English, often with spelling variations.
 * JS `\b` does not work with Devanagari, so word handling here is token based.
 */

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\u0a00-\u0a7f]+/g, ' ').trim();
}

export function tokens(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

const compact = (s: string) => normalize(s).replace(/\s+/g, '');

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// ---------------------------------------------------------------- simple intents

export const GREETING = /^(hi+|hello+|hey+|hlo|helo|namaste|namaskar|pranam|ram ram|jai shri ram|radhe radhe|sat sri akal|waheguru|good (?:morning|evening|afternoon)|नमस्ते|नमस्कार|हेलो|हैलो|हॅलो|हाय|प्रणाम|राम राम|ਸਤ ਸ੍ਰੀ ਅਕਾਲ|ਹੈਲੋ|ਨਮਸਤੇ|ਵਾਹਿਗੁਰੂ)(?: ji| g| जी| ਜੀ)?$/i;
export function isGreeting(text: string): boolean { return GREETING.test(normalize(text)); }

const CANCEL = /^(cancel|menu|start|start over|reset|stop|rehne do|rahne do|chhod do|chod do|band karo|nahi chahiye|nhi chahiye|क्लोज|रहने दो|कैंसल|रद्द|रद्द करें|रद्द करा|मेनू|मेन्यू|मुख्य मेनू|ਰੱਦ|ਮੀਨੂ|ਮੁੱਖ ਮੀਨੂ)$/i;
const MENU_WORD = /^(menu|start|start over|reset|मेनू|मेन्यू|मुख्य मेनू|ਮੀਨੂ|ਮੁੱਖ ਮੀਨੂ)$/i;
export function isMenuWord(text: string): boolean { return MENU_WORD.test(normalize(text)); }
const LANGUAGE_WORD = /^(language|lang|change language|language badlein|bhasha|bhasha badlein|bhasa|भाषा|भाषा बदलें|भाषा बदला|ਭਾਸ਼ਾ|ਭਾਸ਼ਾ ਬਦਲੋ)$/i;
export function isLanguageRequest(text: string): boolean { return LANGUAGE_WORD.test(normalize(text)); }
export function isCancelOrMenu(text: string): boolean { return CANCEL.test(normalize(text)); }

const YES = /^(haan|han|haa|ha|hanji|han ji|haan ji|yes|y|yep|ok|okay|ji|ji haan|bilkul|confirm|confirmed|sahi hai|theek hai|thik hai|done|हाँ|हां|हा|जी|ठीक है|सही है|कन्फर्म|हो|होय|बरोबर|ठीक आहे|ਹਾਂ|ਹਾਂ ਜੀ|ਹਾਂਜੀ|ਜੀ|ਠੀਕ ਹੈ|ਪੱਕਾ|पक्का|पक्का करें|निश्चित करा)$/i;
const NO = /^(no|nahi|nahin|nhi|na|nope|galat|galat hai|cancel|नहीं|नही|ना|गलत|नाही|नको|ਨਹੀਂ|ਨਾ|ਗਲਤ)$/i;
export function isYes(text: string): boolean { return YES.test(normalize(text)); }
export function isNo(text: string): boolean { return NO.test(normalize(text)); }

const NEGATION = new Set(['nahi', 'nahin', 'nhi', 'nai', 'mat', 'not', 'no', 'nahee', 'नहीं', 'नही', 'मत', 'नाही', 'नको', 'ਨਹੀਂ']);
const PRE_NEGATION = new Set(['not', 'no', 'bina', 'except', 'without']);

// ---------------------------------------------------------------- product matching

export type NamedProduct = { id: string; name: string };

/**
 * Finds products the customer actually wants.
 *  - tolerant of spacing ("ganga jal") and 1-letter typos ("nariyel")
 *  - ignores products that are negated ("Nariyal chahiye, gangajal nahi" -> only Nariyal)
 * Returns matches in the order they are mentioned, plus the negated ones for diagnostics.
 */
export function findProducts<T extends NamedProduct>(text: string, products: T[]): { wanted: T[]; negated: T[]; spans: Map<string, [number, number]> } {
  const toks = tokens(text);
  const wanted: T[] = [];
  const negated: T[] = [];
  const spans = new Map<string, [number, number]>();

  for (const p of products) {
    const target = compact(p.name);
    if (!target) continue;
    let found: [number, number] | null = null;
    for (let start = 0; start < toks.length && !found; start++) {
      let joined = '';
      for (let end = start; end < Math.min(toks.length, start + 3); end++) {
        joined += toks[end];
        if (joined === target) { found = [start, end]; break; }
        const allowTypo = end === start && target.length >= 5 && !/\d/.test(joined) && Math.abs(joined.length - target.length) <= 1;
        if (allowTypo && editDistance(joined, target, 1) <= 1) { found = [start, end]; break; }
        if (joined.length > target.length + 1) break;
      }
    }
    if (!found) continue;
    spans.set(p.id, found);
    const after = toks.slice(found[1] + 1, found[1] + 3);
    const before = toks[found[0] - 1];
    const isNegated = after.some((t) => NEGATION.has(t)) || (before !== undefined && PRE_NEGATION.has(before));
    (isNegated ? negated : wanted).push(p);
  }
  // "Rudraksha Mala" also contains the word "Mala" (another product). The more specific, longer name wins.
  const inside = (small: [number, number], big: [number, number]) => big[0] <= small[0] && small[1] <= big[1] && (big[1] - big[0]) > (small[1] - small[0]);
  const dropContained = (list: T[]) => list.filter((p) => !list.some((q) => q.id !== p.id && inside(spans.get(p.id)!, spans.get(q.id)!)));
  const wantedFinal = dropContained(wanted);
  const negatedFinal = dropContained(negated);
  wantedFinal.sort((a, b) => spans.get(a.id)![0] - spans.get(b.id)![0]);
  return { wanted: wantedFinal, negated: negatedFinal, spans };
}

const NUMBER_WORDS: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5,
  chhe: 6, che: 6, chhah: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10,
};
const UNIT_WORDS = new Set(['x', 'pcs', 'pc', 'piece', 'pieces', 'nos', 'no', 'qty', 'quantity', 'adad', 'packet', 'packets']);

/** Quantity written next to the product ("2 nariyal", "nariyal x3", "do mala"). Defaults to 1. */
export function parseQuantity(text: string, span?: [number, number]): number {
  const toks = tokens(text);
  const toNum = (t?: string) => {
    if (!t) return undefined;
    if (/^\d{1,3}$/.test(t)) return Number(t);
    return NUMBER_WORDS[t];
  };
  if (span) {
    let i = span[0] - 1;
    while (i >= 0 && UNIT_WORDS.has(toks[i])) i--;
    const before = toNum(toks[i]);
    if (before && before >= 1 && before <= 100) return before;
    let j = span[1] + 1;
    while (j < toks.length && UNIT_WORDS.has(toks[j])) j++;
    const after = toNum(toks[j]);
    if (after && after >= 1 && after <= 100 && /^\d+$/.test(toks[j])) return after;
  }
  const explicit = text.toLowerCase().match(/(?:qty|quantity|matra)\s*[:=]?\s*(\d{1,3})\b/);
  if (explicit) return Math.min(100, Math.max(1, Number(explicit[1])));
  return 1;
}

export function parseExplicitQuantity(text: string): number | null {
  const m = text.toLowerCase().match(/^(?:qty|quantity|matra)\s*[:=]?\s*(\d{1,3})$/) || text.toLowerCase().match(/^(\d{1,3})\s*(?:pcs|pc|piece|pieces|nos|qty)$/);
  return m ? Math.min(100, Math.max(1, Number(m[1]))) : null;
}

const BUY = /(?:^|[^a-z])(kharid\w*|khareed\w*|order|buy|purchase|chahiye|chahie|chaiye|chahiyen|lena|leni|lene|mangwa\w*|mangna|le\s*lo|dedo|de\s*do|book)(?:$|[^a-z])|खरीद|ऑर्डर|चाहिए|लेना|मंगवा|खरेदी|हवे|हवी|ਖਰੀਦ|ਆਰਡਰ|ਚਾਹੀਦਾ|ਚਾਹੀਦੀ/i;
const PRICE = /(?:^|[^a-z])(price|rate|kitne|kitna|kitni|kimat|keemat|cost|daam|dam|bhaav|bhav)(?:$|[^a-z])|कीमत|दाम|भाव|कितने|कितना/i;
const CATALOG = /(?:^|[^a-z])(products?|catalog|catalogue|saman|samaan|shop|store|dukan|price\s*list|rate\s*list|what\s*do\s*you\s*sell)(?:$|[^a-z])|प्रोडक्ट|सामान|दुकान/i;
const PHOTO = /(?:^|[^a-z])(photo|photos|image|images|pic|pics|picture|pictures|tasveer|tasvir|dikhao|dikha|dikhana|dekhna|dekhni|dikhaiye)(?:$|[^a-z])|फोटो|तस्वीर|दिखाओ|दिखा|दाखवा|ਫੋਟੋ|ਤਸਵੀਰ|ਦਿਖਾਓ/i;
export function hasPhotoIntent(text: string): boolean { return PHOTO.test(text); }
export function hasBuyIntent(text: string): boolean { return BUY.test(text); }
export function hasPriceIntent(text: string): boolean { return PRICE.test(text); }
export function hasCatalogIntent(text: string): boolean { return CATALOG.test(text); }

// ---------------------------------------------------------------- donation / payment intents

const DONATION_WORDS = /(?:^|[^a-z])(donat\w*|daan|chanda|contribut\w*|yogdaan|seva\s*rashi)(?:$|[^a-z])|दान|योगदान|चंदा|चन्दा|देणगी|ਦਾਨ|ਚੰਦਾ/i;
export function hasDonationIntent(text: string): boolean { return DONATION_WORDS.test(text); }

export const MIN_DONATION = 1;
export const MAX_DONATION = 10_000_000;

export type AmountParse = { amount: number | null; reason?: 'decimal' | 'range' | 'none' };

/**
 * Extracts a donation amount in whole rupees.
 * Accepts: "₹900", "900 rupay", "Rs. 1,000", "inr 500", "500/-", a bare "500" (when allowBare),
 * or exactly one number in a message that is clearly about donating.
 */
export function parseAmount(text: string, opts: { allowBare?: boolean } = {}): AmountParse {
  const t = text.replace(/,/g, '').trim();
  const withUnit = t.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:₹|rs\b\.?|rupay\w*|rupe\w*|rupiy\w*|rupaye|रुपय\w*|रुपए|रु\b|inr|\/-)/i);
  let raw = withUnit ? (withUnit[1] ?? withUnit[2]) : undefined;
  if (raw === undefined) {
    const nums = t.match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g) || [];
    const bare = opts.allowBare && /^\D{0,12}\d+(?:\.\d+)?\D{0,12}$/.test(t);
    if (nums.length === 1 && (bare || hasDonationIntent(t))) raw = nums[0];
  }
  if (raw === undefined) return { amount: null, reason: 'none' };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { amount: null, reason: 'none' };
  if (!Number.isInteger(value)) return { amount: null, reason: 'decimal' };
  if (value < MIN_DONATION || value > MAX_DONATION) return { amount: null, reason: 'range' };
  return { amount: value };
}

const RECEIPT_WORDS = /receipt|rasid|raseed|rasid|रसीद|पावती|ਰਸੀਦ|invoice/i;
const PAY_WORDS = /(?:^|[^a-z])(payment|pay|paid|donation|donate|daan|paisa|paise|paisey|transfer|link|amount)(?:$|[^a-z])|दान|पेमेंट|भुगतान|पैसे/i;
const DONE_WORDS = /kar\s*diya|kardiya|kar\s*di\b|kardi\b|kr\s*diya|de\s*diya|dediya|de\s*di\b|ho\s*gaya|hogaya|ho\s*gya|hogya|ho\s*chuka|complete|completed|success|successful|bhej\s*diya|bhej\s*di\b|kar\s*chuka|kar\s*chuki|done|paid|कर\s*दिया|कर\s*दी|दे\s*दिया|हो\s*गया|भेज\s*दिया|भेज\s*दी/i;

export function isReceiptRequest(text: string): boolean { return RECEIPT_WORDS.test(text); }

/** "Kardiya donation", "payment ho gaya", "kar diya donation meri receipt?" , "paid" */
export function isPaymentClaim(text: string): boolean {
  if (!DONE_WORDS.test(text)) return false;
  const wordCount = tokens(text).length;
  return PAY_WORDS.test(text) || RECEIPT_WORDS.test(text) || wordCount <= 3;
}

export function extractDonationRef(text: string): string | null { return text.match(/\bDON-\d+-\d+\b/i)?.[0]?.toUpperCase() ?? null; }
export function extractOrderRef(text: string): string | null { return text.match(/\bORD-\d+-\d+\b/i)?.[0]?.toUpperCase() ?? null; }

const TRACK_WORDS = /(?:^|[^a-z])(track\w*|status|shipment|awb|parcel|delivery\s*status|(?:order|parcel|package|saman|samaan)\s+(?:kahan|kaha|kab)|kab\s*aayega|kab\s*tak\s*aayega)(?:$|[^a-z])|ट्रैक|स्टेटस/i;
export function hasTrackIntent(text: string): boolean { return TRACK_WORDS.test(text); }

const HUMAN = /(?:^|[^a-z])(human|agent|representative|customer\s*care|insaan|manushya|operator)(?:$|[^a-z])|kisi\s*se\s*baat|baat\s*karni|support\s*team|talk\s*to\s*(?:someone|a\s*person)|इंसान|किसी\s*से\s*बात|सपोर्ट|टीम\s*से\s*बात|टीमशी|ਟੀਮ\s*ਨਾਲ|ਇਨਸਾਨ/i;
export function hasHumanIntent(text: string): boolean { return HUMAN.test(text); }

// ---------------------------------------------------------------- address

export function extractPin(text: string): string | null {
  return text.match(/(?<!\d)([1-9]\d{5})(?!\d)/)?.[1] ?? null;
}

export type AddressCheck = { ok: true; address: string; pin: string } | { ok: false; reason: 'addr_no_pin' | 'addr_short' | 'addr_long' };

export function validateAddress(text: string): AddressCheck {
  const address = text.replace(/\s+/g, ' ').trim();
  const pin = extractPin(address);
  if (!pin) return { ok: false, reason: 'addr_no_pin' };
  const words = address.split(' ').filter(Boolean);
  if (address.length < 15 || words.length < 3) return { ok: false, reason: 'addr_short' };
  if (address.length > 400) return { ok: false, reason: 'addr_long' };
  return { ok: true, address, pin };
}

export function validateName(text: string): { ok: true; name: string } | { ok: false } {
  const name = text.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 60) return { ok: false };
  if (/\d/.test(name)) return { ok: false };
  if (isYes(name) || isNo(name) || isCancelOrMenu(name) || isGreeting(name)) return { ok: false };
  if (!/[a-z\u0900-\u097f\u0a00-\u0a7f]/i.test(name)) return { ok: false };
  return { ok: true, name };
}

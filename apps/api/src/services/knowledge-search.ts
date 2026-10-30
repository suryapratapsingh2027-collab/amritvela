/**
 * Lightweight, dependency-free retrieval over the Trust knowledge text. It makes the assistant useful even
 * when Gemini is not configured, is rate-limited, or returns nothing, and it can never invent facts:
 * it only returns text that exists in the knowledge documents.
 */
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'on', 'and', 'or', 'for', 'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'hai', 'hain', 'h', 'kya', 'kaise', 'kaun', 'kab', 'aur', 'ye', 'yeh', 'wo', 'woh', 'bhi', 'ho', 'hota', 'hoti', 'karta', 'karti', 'karte', 'kare', 'karein', 'bataiye', 'batao', 'bata', 'please', 'plz', 'mujhe', 'mere', 'aap', 'tum', 'hum', 'trust', 'amrit', 'vela', 'amritvela', 'about', 'tell', 'me']);

// Customers write Hinglish; the knowledge base is English. Map common words to the English terms used in it.
const SYNONYMS: Record<string, string[]> = {
  pata: ['address'], kahan: ['address', 'located'], kaha: ['address'], location: ['address'], jagah: ['address'],
  number: ['phone', 'contact'], sampark: ['contact'], mobile: ['phone'], call: ['phone', 'contact'], email: ['email', 'contact'], mail: ['email'],
  baare: ['about', 'mission'], baarey: ['about'], jankari: ['about', 'mission'], information: ['about'], info: ['about'], itihas: ['incorporated', 'about'], history: ['incorporated'],
  sthapna: ['incorporated'], sthapit: ['incorporated'], shuru: ['incorporated'], founded: ['incorporated'], established: ['incorporated'], registered: ['registered'], registration: ['registered'],
  bhojan: ['langar', 'food'], khana: ['langar', 'food'], roti: ['langar', 'food'], bhukh: ['langar', 'hunger'], seva: ['langar', 'seva', 'mission'],
  ilaaj: ['medical', 'healthcare'], swasthya: ['healthcare'], hospital: ['hospital', 'medical'], blood: ['blood', 'medical'], khoon: ['blood'], aankh: ['eye'], camp: ['camps', 'medical'],
  shiksha: ['education', 'school'], padhai: ['education'], school: ['school', 'education'], college: ['college'],
  daan: ['donate', 'donation'], dan: ['donate'], chanda: ['donate'], donation: ['donate', 'donation'], donate: ['donate'], dena: ['donate'],
  raseed: ['receipt'], receipt: ['receipt'], rasid: ['receipt'], tax: ['80g', 'tax'], '80g': ['80g', 'tax'],
  wapas: ['refund'], refund: ['refund'], paisa: ['refund'], return: ['refund'], cancel: ['refund', 'cancellation'],
  courier: ['shipping', 'delivery'], dak: ['shipping'], bhejna: ['shipping', 'delivery'], delivery: ['shipping', 'delivery'], shipping: ['shipping', 'delivery'], kharcha: ['shipping'], charge: ['shipping'],
  rehna: ['dharamshala', 'accommodation'], thaharna: ['dharamshala', 'accommodation'], ruk: ['accommodation'], room: ['rooms', 'accommodation'], sangat: ['dharamshala', 'sangat'], dharamshala: ['dharamshala', 'accommodation'],
  yojana: ['future', 'plans'], plans: ['future', 'plans'], aage: ['future'], future: ['future', 'plans'],
  record: ['achievements', 'record'], award: ['achievements'], uplabdhi: ['achievements'], achievement: ['achievements'],
  kirtan: ['kirtan'], langar: ['langar'], sukhmani: ['sukhmani'], timing: ['2:30', 'kirtan'], samay: ['2:30', 'kirtan'], time: ['2:30', 'kirtan'], subah: ['2:30', 'amrit'],
  founder: ['inspiration', 'bhai'], guru: ['inspiration'], rinku: ['rinkuji'], rinkuji: ['rinkuji'], sant: ['inspiration'],
  product: ['products'], mala: ['malas', 'products'], pendrive: ['pendrives'], dupatta: ['dupattas'], rumal: ['rumals'], shop: ['products'],
  support: ['support', 'person'], human: ['support', 'person'],
};

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9:]+/g) || []);

type Section = { title: string; body: string };

function splitSections(knowledge: string): Section[] {
  const text = knowledge.replace(/^KB_VERSION:\d+\s*$/gm, '').trim();
  if (/^## /m.test(text)) {
    return text.split(/^## /m).map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
      const [title, ...rest] = chunk.split('\n');
      return { title: title.trim(), body: rest.join('\n').trim() };
    }).filter((s) => s.body);
  }
  // Admin-written documents: one section per paragraph, first line as title.
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const [title, ...rest] = p.split('\n');
    return { title: title.trim(), body: (rest.length ? rest.join('\n') : p).trim() };
  });
}

export function searchKnowledge(question: string, knowledge: string, opts: { maxChars?: number } = {}): string | null {
  const sections = splitSections(knowledge);
  if (!sections.length) return null;
  const q = new Set<string>();
  for (const w of words(question)) {
    if (STOP.has(w) || w.length < 2) continue;
    q.add(w);
    for (const syn of SYNONYMS[w] || []) q.add(syn);
  }
  if (!q.size) return null;

  const scored = sections.map((s) => {
    const title = new Set(words(s.title));
    const body = new Set(words(s.body));
    let score = 0;
    for (const t of q) { if (title.has(t)) score += 3; if (body.has(t)) score += 1; }
    return { s, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  if (!scored.length || scored[0].score < 2) return null;
  const top = scored.filter((x) => x.score >= scored[0].score * 0.6).slice(0, 2);
  const max = opts.maxChars ?? 1100;
  let out = top.map((x) => `${x.s.title}\n${x.s.body}`).join('\n\n');
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return out;
}

/** Title of the best matching knowledge section (used to pick a pre-translated answer for non-English customers). */
export function bestSectionTitle(question: string, knowledge: string): string | null {
  const sections = splitSections(knowledge);
  const q = new Set<string>();
  for (const w of words(question)) { if (STOP.has(w) || w.length < 2) continue; q.add(w); for (const syn of SYNONYMS[w] || []) q.add(syn); }
  let best: { title: string; score: number } | null = null;
  for (const sec of sections) {
    const title = new Set(words(sec.title)); const body = new Set(words(sec.body));
    let score = 0; for (const t of q) { if (title.has(t)) score += 3; if (body.has(t)) score += 1; }
    if (score >= 2 && (!best || score > best.score)) best = { title: sec.title, score };
  }
  return best?.title ?? null;
}

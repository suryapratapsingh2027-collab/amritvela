import OpenAI from 'openai';
import { db } from '../db';
import { env } from '../config';
const client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
export async function answer(text: string, context: string) {
  if (!client || env.MOCK_PROVIDERS) return mockIntent(text);
  const system = `You are the Trust's customer assistant. Answer only from TRUST CONTEXT. Do not invent policies, prices, payment status, shipment status or guarantees. For donation, shopping, order tracking and human support, guide the customer to the appropriate next step. Keep replies concise and friendly.\nTRUST CONTEXT:\n${context}`;
  const r = await client.chat.completions.create({ model: env.OPENAI_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: text }], temperature: 0.2 });
  return { text: r.choices[0]?.message?.content || 'Please contact our support team.', intent: detectIntent(text) };
}
function detectIntent(text: string) { const t = text.toLowerCase(); if (/human|person|agent|support|call/.test(t)) return 'HUMAN'; if (/donat|contribut/.test(t)) return 'DONATION'; if (/product|shop|buy|item|price/.test(t)) return 'SHOP'; if (/track|order|shipment|awb|delivery/.test(t)) return 'TRACK'; return 'GENERAL'; }
function mockIntent(text: string) { const intent = detectIntent(text); const textByIntent: Record<string,string> = { DONATION:'Absolutely. You can donate online from the Donate page. Tell me the amount you want to contribute and I will guide you.', SHOP:'Sure. Open the product catalogue to browse available Trust products, prices and stock.', TRACK:'Please share your order number (for example ORD-...) and I can help you check its status.', HUMAN:'I can connect you with the Trust support team. Your conversation has been marked for human follow-up.', GENERAL:'I can help with Trust information, donations, products, payments, orders, tracking and human support. What would you like to do?' }; return { text: textByIntent[intent], intent }; }
export async function knowledge() { const docs = await db.knowledgeDocument.findMany({ where: { active: true }, take: 50, orderBy: { updatedAt: 'desc' } }); return docs.map(d => `${d.title}\n${d.content}`).join('\n\n'); }

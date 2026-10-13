
import { GoogleGenAI } from '@google/genai';
import { db } from '../db';
import { env } from '../config';

const client = env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  : null;

export async function answer(text: string, context: string) {
  // Gemini key nahi hai to fallback mock reply use hoga.
  if (!client) {
    return mockIntent(text);
  }

  const system = `You are the Trust's customer assistant.
Answer only from TRUST CONTEXT. Do not invent policies, prices,
payment status, shipment status or guarantees.

For donation, shopping, order tracking and human support,
guide the customer to the appropriate next step.
Keep replies concise and friendly.

If the customer mentions a donation amount, acknowledge it,
but never claim that a payment has been completed unless
verified by the system.

TRUST CONTEXT:
${context}`;

  const response = await client.models.generateContent({
    model: env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    contents: text,
    config: {
      systemInstruction: system,
      temperature: 0.2,
    },
  });

  return {
    text:
      response.text?.trim() ||
      'Please contact our support team.',
    intent: detectIntent(text),
  };
}

function detectIntent(text: string) {
  const t = text.toLowerCase();

  if (/human|person|agent|support|call/.test(t)) {
    return 'HUMAN';
  }

  if (/donat|contribut/.test(t)) {
    return 'DONATION';
  }

  if (/product|shop|buy|item|price/.test(t)) {
    return 'SHOP';
  }

  if (/track|order|shipment|awb|delivery/.test(t)) {
    return 'TRACK';
  }

  return 'GENERAL';
}

function mockIntent(text: string) {
  const intent = detectIntent(text);

  const amountMatch = text.match(
    /(?:₹\s*|rs\.?\s*|inr\s*)?(\d+(?:,\d{3})*(?:\.\d{1,2})?)(?:\s*(?:rs\.?|rupees?|rupaye|inr))?/i
  );

  const amount = amountMatch?.[1]?.replace(/,/g, '');

  if (intent === 'DONATION' && amount) {
    return {
      text: `You want to donate ₹${amount}. Please continue to the Donate page to complete your donation. This is a test reply; no payment has been made.`,
      intent: 'DONATION',
    };
  }

  const textByIntent: Record<string, string> = {
    DONATION:
      'Sure! How much would you like to donate? You can enter an amount such as ₹500.',

    SHOP:
      'Sure. Open the product catalogue to browse available Trust products, prices and stock.',

    TRACK:
      'Please share your order number (for example ORD-...) and I can help you check its status.',

    HUMAN:
      'I can connect you with the Trust support team. Your conversation has been marked for human follow-up.',

    GENERAL:
      'I can help with Trust information, donations, products, payments, orders, tracking and human support. What would you like to do?',
  };

  return {
    text: textByIntent[intent],
    intent,
  };
}

export async function knowledge() {
  const docs = await db.knowledgeDocument.findMany({
    where: { active: true },
    take: 50,
    orderBy: { updatedAt: 'desc' },
  });

  return docs
    .map(
      (d: { title: string; content: string }) =>
        `${d.title}\n${d.content}`
    )
    .join('\n\n');
}
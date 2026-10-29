import { db } from '../db';

/** Hands a conversation to a human and makes sure exactly one OPEN ticket exists. */
export async function openSupportTicket(conversationId: string, subject: string) {
  await db.conversation.update({ where: { id: conversationId }, data: { mode: 'HUMAN' } });
  const existing = await db.supportTicket.findFirst({ where: { conversationId, status: 'OPEN' } });
  if (!existing) await db.supportTicket.create({ data: { conversationId, subject } });
}

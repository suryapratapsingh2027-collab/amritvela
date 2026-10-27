import bcrypt from 'bcryptjs';
import { db } from './db';
import { env } from './config';
import { TRUST_KNOWLEDGE_TITLE, TRUST_KNOWLEDGE_VERSION, trustKnowledge } from './services/trust-knowledge';

async function bootstrap(){
  const passwordHash=await bcrypt.hash(env.ADMIN_PASSWORD,12);
  await db.adminUser.upsert({where:{email:env.ADMIN_EMAIL},update:{passwordHash,role:'ADMIN'},create:{email:env.ADMIN_EMAIL,passwordHash,role:'ADMIN'}});
  // Demo products are no longer re-created on every boot (they polluted the live catalogue and WhatsApp replies).
  // Keep the verified Trust knowledge loaded in production. Hand-edited documents are never overwritten.
  const found = await db.knowledgeDocument.findFirst({ where: { title: TRUST_KNOWLEDGE_TITLE } });
  if (!found) {
    await db.knowledgeDocument.create({ data: { title: TRUST_KNOWLEDGE_TITLE, content: trustKnowledge, active: true } });
    console.log('[BOOTSTRAP] Trust knowledge created');
  } else {
    const version = Number(found.content.match(/^KB_VERSION:(\d+)/)?.[1] ?? 0);
    const isPlaceholder = /^Add the Trust-approved/i.test(found.content.trim());
    const isOldSeed = found.content.startsWith('AMRIT VELA TRUST — VERIFIED WEBSITE INFORMATION');
    if (isPlaceholder || isOldSeed || (version > 0 && version < TRUST_KNOWLEDGE_VERSION)) {
      await db.knowledgeDocument.update({ where: { id: found.id }, data: { content: trustKnowledge, active: true } });
      console.log('[BOOTSTRAP] Trust knowledge updated to version', TRUST_KNOWLEDGE_VERSION);
    }
  }
}
bootstrap().then(()=>db.$disconnect()).catch(async e=>{console.error(e);await db.$disconnect();process.exit(1)});

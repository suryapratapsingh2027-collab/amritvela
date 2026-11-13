import bcrypt from 'bcryptjs';
import { db } from './db';
import { env } from './config';
import { backfillReceiptNumbers } from './services/receipt-number';
import { TRUST_KNOWLEDGE_TITLE, TRUST_KNOWLEDGE_VERSION, trustKnowledge } from './services/trust-knowledge';

async function bootstrap(){
  // Create the first admin only. Once an admin exists, passwords/emails changed in the panel are never overwritten
  // on restart (the old code reset the password to ADMIN_PASSWORD at every boot and re-created the old email).
  const adminCount = await db.adminUser.count();
  if (adminCount === 0) {
    await db.adminUser.create({ data: { email: env.ADMIN_EMAIL.toLowerCase(), passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12), role: 'ADMIN' } });
    console.log('[BOOTSTRAP] First admin created:', env.ADMIN_EMAIL);
  } else if (env.ADMIN_RESET_ON_BOOT === 'true') {
    // Emergency recovery: set ADMIN_RESET_ON_BOOT=true + ADMIN_EMAIL + ADMIN_PASSWORD, deploy, sign in, then set it back to false.
    const existing = await db.adminUser.findFirst({ where: { email: { equals: env.ADMIN_EMAIL, mode: 'insensitive' } } });
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    if (existing) await db.adminUser.update({ where: { id: existing.id }, data: { passwordHash, role: 'ADMIN', tokenVersion: { increment: 1 } } });
    else await db.adminUser.create({ data: { email: env.ADMIN_EMAIL.toLowerCase(), passwordHash, role: 'ADMIN' } });
    console.warn('[BOOTSTRAP] ADMIN_RESET_ON_BOOT=true: admin password reset from environment. Set it back to false.');
  }
  // Demo products are no longer re-created on every boot (they polluted the live catalogue and WhatsApp replies).
  // Old verified donations (from before receipt numbers existed) get their numbers, in the order they were paid.
  const numbered = await backfillReceiptNumbers();
  if (numbered) console.log(`[BOOTSTRAP] Receipt numbers assigned to ${numbered} older donations`);

  // The trusts a donor can choose on WhatsApp / the website (from the client's flow). Created once; afterwards the admin owns them
  // (Admin > Trusts: payment account, QR, quick amounts, on/off). They use the main Razorpay account until the admin gives a trust its own keys.
  if (!(await db.setting.findUnique({ where: { key: 'seed.trusts.r7' } }))) {
    const seeds = [
      { slug: 'nanak-roti-trust', name: 'Nanak Roti Trust', sortOrder: 1, presets: [{ label: 'One time langar', amount: 13000 }] },
      { slug: 'helping-bezubaan-trust', name: 'Helping Bezubaan', sortOrder: 2, presets: [{ label: 'One day meal', amount: 5100 }] },
      { slug: 'amritsar-dharamshala', name: 'Amritsar Dharamshala', sortOrder: 3, presets: [] as { label: string; amount: number }[] },
      { slug: 'general-donation', name: 'General Donation', sortOrder: 99, presets: [] as { label: string; amount: number }[] },
    ];
    for (const x of seeds) {
      if (await db.trust.findUnique({ where: { slug: x.slug } })) continue;
      await db.trust.create({ data: { slug: x.slug, name: x.name, active: true, sortOrder: x.sortOrder, infoEn: '', accountMode: 'DEFAULT', offerQr: true, presets: x.presets } });
    }
    await db.setting.create({ data: { key: 'seed.trusts.r7', value: new Date().toISOString() } });
    console.log('[BOOTSTRAP] Donation trusts created (Nanak Roti, Helping Bezubaan, Amritsar Dharamshala, General Donation)');
  }

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

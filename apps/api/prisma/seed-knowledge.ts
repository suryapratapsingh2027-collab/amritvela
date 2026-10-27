import { PrismaClient } from '@prisma/client';
import { trustKnowledge } from './trust-knowledge';

const db = new PrismaClient();

async function main() {
  const existing = await db.knowledgeDocument.findFirst({
    where: { title: 'Trust FAQ & Policies' },
    select: { id: true },
  });

  if (existing) {
    await db.knowledgeDocument.update({
      where: { id: existing.id },
      data: { content: trustKnowledge, active: true },
    });
  } else {
    await db.knowledgeDocument.create({
      data: { title: 'Trust FAQ & Policies', content: trustKnowledge, active: true },
    });
  }

  console.log('Trust knowledge document is ready.');
}

main()
  .catch((error) => {
    console.error('Failed to seed Trust knowledge:', error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'change-me';
  const passwordHash = await bcrypt.hash(password, 12);

  await db.adminUser.upsert({
    where: { email },
    update: { passwordHash, role: 'ADMIN' },
    create: { email, passwordHash, role: 'ADMIN' },
  });

  const products = [
    ['Trust Cotton Bag', 'trust-cotton-bag', 'Reusable cotton bag for everyday use.', 299, 20, 'Merchandise'],
    ['Handmade Diya', 'handmade-diya', 'Handmade decorative diya.', 199, 50, 'Gifts'],
    ['Trust T-Shirt', 'trust-tshirt', 'Comfortable Trust T-shirt.', 599, 25, 'Apparel'],
  ] as const;

  for (const [name, slug, description, price, stock, category] of products) {
    const existing = await db.product.findUnique({ where: { slug } });

    if (!existing) {
      await db.product.create({
        data: {
          name,
          slug,
          description,
          price,
          stock,
          category,
          imageUrl: slug === 'trust-tshirt' ? '/assets/product-tshirt.png' : null,
        },
      });
    } else if (slug === 'trust-tshirt' && !existing.imageUrl) {
      await db.product.update({
        where: { slug },
        data: { imageUrl: '/assets/product-tshirt.png' },
      });
    }
  }

  if (!(await db.knowledgeDocument.findFirst({ where: { title: 'Trust FAQ & Policies' } }))) {
    await db.knowledgeDocument.create({
      data: {
        title: 'Trust FAQ & Policies',
        content: 'Add Trust-approved mission, contact details, donation policy, product policy, shipping policy, refund policy and support hours.',
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

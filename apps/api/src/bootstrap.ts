import bcrypt from 'bcryptjs';
import { db } from './db';
import { env } from './config';

async function bootstrap(){
  const passwordHash=await bcrypt.hash(env.ADMIN_PASSWORD,12);
  await db.adminUser.upsert({where:{email:env.ADMIN_EMAIL},update:{passwordHash,role:'ADMIN'},create:{email:env.ADMIN_EMAIL,passwordHash,role:'ADMIN'}});
  // Demo products are no longer re-created on every boot (they polluted the live catalogue and WhatsApp replies).
  const title='Trust FAQ & Policies';
  const found=await db.knowledgeDocument.findFirst({where:{title}});
  if(!found)await db.knowledgeDocument.create({data:{title,content:'Add the Trust-approved mission, contact details, donation policy, product policy, shipping policy, refund policy and support hours from the admin console before enabling production AI.'}});
}
bootstrap().then(()=>db.$disconnect()).catch(async e=>{console.error(e);await db.$disconnect();process.exit(1)});

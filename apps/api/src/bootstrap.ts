import bcrypt from 'bcryptjs';
import { db } from './db';
import { env } from './config';

async function bootstrap(){
  const passwordHash=await bcrypt.hash(env.ADMIN_PASSWORD,12);
  await db.adminUser.upsert({where:{email:env.ADMIN_EMAIL},update:{passwordHash,role:'ADMIN'},create:{email:env.ADMIN_EMAIL,passwordHash,role:'ADMIN'}});
  const products=[
    {name:'Trust Cotton Bag',slug:'trust-cotton-bag',description:'Reusable cotton bag for everyday use.',price:299,stock:20,category:'Merchandise'},
    {name:'Handmade Diya',slug:'handmade-diya',description:'Handmade decorative diya.',price:199,stock:50,category:'Gifts'},
    {name:'Trust T-Shirt',slug:'trust-tshirt',description:'Comfortable Trust T-shirt.',price:599,stock:25,category:'Apparel'}
  ];
  for(const product of products){const found=await db.product.findUnique({where:{slug:product.slug}});if(!found)await db.product.create({data:product});}
  const title='Trust FAQ & Policies';
  const found=await db.knowledgeDocument.findFirst({where:{title}});
  if(!found)await db.knowledgeDocument.create({data:{title,content:'Add the Trust-approved mission, contact details, donation policy, product policy, shipping policy, refund policy and support hours from the admin console before enabling production AI.'}});
}
bootstrap().then(()=>db.$disconnect()).catch(async e=>{console.error(e);await db.$disconnect();process.exit(1)});

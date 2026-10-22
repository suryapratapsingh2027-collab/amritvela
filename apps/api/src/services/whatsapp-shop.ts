import { db } from '../db';
import { createOrderPaymentLink } from '../integrations/razorpay';

const SUPPORT = 'Agar dikkat aaye to Trust team se 6913001300 par sampark karein.';
const SHOP_START = /gangajal|ganga\s*jal|mala|dupatta|rumal|diya|t-?shirt|product|kharid|kharidna|order\s*karna|buy|purchase|सामान|खरीद|गंगाजल|ऑर्डर/i;
const YES = /^(haan|ha|yes|y|ok|okay|ji|bilkul|han|हाँ|हां|जी)$/i;

function money(n: number) { return `₹${n.toLocaleString('en-IN')}`; }
function normalize(s: string) { return s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim(); }

/** Returns null when this message is not a product-order flow message. */
export async function handleWhatsAppShop(phone: string, text: string, conversationId: string): Promise<string | null> {
  const recent = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'desc' }, take: 12, select: { direction: true, text: true } });
  const latestOut = recent.find(m => m.direction === 'OUT')?.text || '';
  const latestIn = recent.find(m => m.direction === 'IN')?.text || '';
  const user = await db.user.findUnique({ where: { phone } });
  const products = await db.product.findMany({ where: { active: true }, orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, description: true, price: true, currency: true, stock: true, slug: true } });
  const t = normalize(text);

  // Continue the previously asked checkout step even if the customer says only a name/address.
  if (/kaun sa product|which product|product ka naam|kya order karna/i.test(latestOut) || /product list|yeh products/i.test(latestOut)) {
    const match = findProduct(text, products);
    if (!match) return productList(products);
    return selectProduct(phone, conversationId, match);
  }

  if (/naam|name|address|pata|delivery details/i.test(latestOut) && /naam|name|address|pata|delivery/i.test(latestOut)) {
    // Name and address are collected in separate steps; do not silently create an order with partial data.
    if (/naam|name/i.test(latestOut) && !/address|pata/i.test(latestOut)) {
      const name = text.trim().slice(0, 100);
      if (name.length < 2 || /^(haan|ha|yes|y|ok|okay|ji|bilkul|han|हाँ|हां|जी)$/i.test(name)) return 'Delivery ke liye apna poora naam bhejein. Sirf haan likhne se naam save nahi ho sakta.';
      await db.user.update({ where: { phone }, data: { name } });
      return 'Dhanyavaad. Ab poora delivery address, area/city, state aur PIN code ek message mein bhejein.';
    }
  }

  if (/poora delivery address|delivery address.*bhejein|address.*pin code/i.test(latestOut)) {
    const address = text.trim();
    if (address.length < 12 || !/\d{6}/.test(address)) return 'Kripya poora address aur 6-digit PIN code bhejein, taaki delivery details complete ho sakein.';
    if (!user?.name) return 'Pehle apna poora naam bhejein.';
    const pending = await db.message.findMany({ where: { conversationId, direction: 'OUT' }, orderBy: { createdAt: 'desc' }, take: 8, select: { text: true } });
    const product = products.find(p => pending.some(m => m.text.includes(p.name)));
    if (!product) return productList(products);
    if (product.stock < 1) return `${product.name} abhi out of stock hai. ${SUPPORT}`;
    const subtotal = product.price;
    const shippingFee = subtotal >= 1000 ? 0 : 80;
    const total = subtotal + shippingFee;
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const order = await db.order.create({ data: { orderNumber, userId: user.id, subtotal, shippingFee, total, address: { full: address }, items: { create: [{ productId: product.id, quantity: 1, unitPrice: product.price }] } } });
    try {
      const link = await createOrderPaymentLink({ amount: total, orderNumber, name: user.name, email: user.email, phone });
      await db.order.update({ where: { id: order.id }, data: { razorpayOrderId: String(link.id) } });
      if (String((link as any).id || '').startsWith('mock_')) {
        return `Order ${orderNumber} ka demo record create hua hai, lekin MOCK_PROVIDERS enabled hai. Yeh real payment link nahi hai aur customer ko payment nahi karni chahiye. Live payment ke liye Render par MOCK_PROVIDERS=false aur valid Razorpay credentials set karein. ${SUPPORT}`;
      }
      const url = String((link as any).short_url || '');
      if (!url) throw new Error('Payment provider did not return a payment URL');
      return `Aapka order create ho gaya hai.\nOrder: ${orderNumber}\nProduct: ${product.name}\nProduct price: ${money(subtotal)}\nDelivery: ${money(shippingFee)}\nTotal: ${money(total)}\n\nPayment link: ${url}\nPayment verify hone ke baad hi order confirmed maana jayega. Payment ke baad isi WhatsApp par message kar sakte hain. Tracking payment confirmation aur dispatch ke baad share hogi.`;
    } catch (e) {
      console.error('[WHATSAPP SHOP] Payment link creation failed:', e);
      return `Order ${orderNumber} record ho gaya hai, lekin abhi payment link generate nahi ho saka. Dobara payment karne ki koshish na karein; Trust team se sampark karein. ${SUPPORT}`;
    }
  }

  const match = findProduct(text, products);
  const askingToBuy = /order|kharid|buy|purchase|chahiye|mangwana|लेना|खरीद|ऑर्डर/i.test(text);
  if (match && askingToBuy) return selectProduct(phone, conversationId, match);
  if (SHOP_START.test(text) && /gangajal|ganga\s*jal|mala|dupatta|rumal|diya|t-?shirt|kharid|order|buy|purchase|खरीद|गंगाजल/i.test(text)) {
    if (products.length === 0) return `Abhi active products database mein available nahi hain. Main price ya stock guess nahi karunga. ${SUPPORT}`;
    return productList(products);
  }
  if (/^(haan|ha|yes|ok|ji|bilkul|han|हाँ|हां)$/i.test(text) && /order|product|kharid/i.test(latestOut)) return productList(products);
  return null;
}

function findProduct(text: string, products: any[]) {
  const n = normalize(text);
  return products.find(p => n === normalize(p.name) || n.includes(normalize(p.name)) || normalize(p.name).includes(n) && n.length > 3);
}
function productList(products: any[]) {
  if (!products.length) return `Abhi active products database mein nahi hain. ${SUPPORT}`;
  return 'Aap kaunsa product order karna chahte hain? Live product list:\n' + products.map(p => `• ${p.name} — ${money(p.price)} — ${p.stock > 0 ? `Stock ${p.stock}` : 'Out of stock'}`).join('\n') + '\n\nProduct ka exact naam bhejein.';
}
async function selectProduct(phone: string, conversationId: string, p: any) {
  if (p.stock < 1) return `${p.name} abhi out of stock hai. Koi doosra product choose karein.`;
  const user = await db.user.findUnique({ where: { phone } });
  // Store the chosen product in a normal outbound message so state survives webhook requests/restarts.
  await db.message.create({ data: { conversationId, direction: 'OUT', text: `Selected product: ${p.name} | ${p.id}` } });
  if (!user?.name) return `Aapne ${p.name} choose kiya hai. Price: ${money(p.price)}. Delivery ke liye apna poora naam bhejein.`;
  return `${p.name} — ${money(p.price)}. Delivery ke liye apna poora address, area/city, state aur 6-digit PIN code ek message mein bhejein. Shipping fee order total mein dikhayi jayegi.`;
}

import axios from 'axios'; import { env } from '../config';
export async function createWooOrder(order:any){if(env.MOCK_PROVIDERS||!env.WOOCOMMERCE_URL)return {id:`mock_woo_${order.orderNumber}`};const r=await axios.post(`${env.WOOCOMMERCE_URL}/wp-json/wc/v3/orders`,order,{auth:{username:env.WOOCOMMERCE_CONSUMER_KEY!,password:env.WOOCOMMERCE_CONSUMER_SECRET!}});return r.data;}

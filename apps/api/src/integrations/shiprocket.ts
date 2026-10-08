import axios from 'axios'; import { env } from '../config';
let token='';
async function login(){if(token)return token;if(!env.SHIPROCKET_EMAIL||!env.SHIPROCKET_PASSWORD||env.MOCK_PROVIDERS)return 'mock';const r=await axios.post(`${env.SHIPROCKET_BASE_URL}/auth/login`,{email:env.SHIPROCKET_EMAIL,password:env.SHIPROCKET_PASSWORD});token=r.data.token;return token;}
export async function createShipment(payload:any){const t=await login();if(t==='mock')return {order_id:`mock_${Date.now()}`,awb_code:`MOCK${Date.now()}`,courier_name:'Mock Courier'};return (await axios.post(`${env.SHIPROCKET_BASE_URL}/orders/create/adhoc`,payload,{headers:{Authorization:`Bearer ${t}`}})).data;}
export async function trackShipment(awb:string){const t=await login();if(t==='mock')return {tracking_data:{shipment_track:[{current_status:'SHIPPED',awb_code:awb}]}};return (await axios.get(`${env.SHIPROCKET_BASE_URL}/courier/track/awb/${awb}`,{headers:{Authorization:`Bearer ${t}`}})).data;}

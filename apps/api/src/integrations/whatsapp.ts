import axios from 'axios'; import { env } from '../config';
export async function sendWhatsAppText(to:string,text:string){
 if(env.MOCK_PROVIDERS || !env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return {mock:true,to,text};
 const url=`https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
 return (await axios.post(url,{messaging_product:'whatsapp',to,type:'text',text:{body:text}},{headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`}})).data;
}
export async function sendWhatsAppDocument(to:string,link:string,filename:string){
 if(env.MOCK_PROVIDERS || !env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return {mock:true,to,link,filename};
 const url=`https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
 return (await axios.post(url,{messaging_product:'whatsapp',to,type:'document',document:{link,filename}},{headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`}})).data;
}

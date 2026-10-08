import express from 'express'; import cors from 'cors'; import { env } from './config'; import auth from './routes/auth'; import products from './routes/products'; import donations from './routes/donations'; import orders from './routes/orders'; import admin from './routes/admin'; import webhooks from './routes/webhooks'; import assistant from './routes/assistant';
const app=express();
app.use(cors({origin:env.WEB_URL,credentials:false}));
app.use(express.json({limit:'2mb',verify:(req:any,_res,buf)=>{req.rawBody=buf.toString()}}));
app.get('/health',(_,res)=>res.json({ok:true,service:'trust-api',mockProviders:env.MOCK_PROVIDERS}));
app.use('/api/auth',auth); app.use('/api/products',products); app.use('/api/donations',donations); app.use('/api/orders',orders); app.use('/api/admin',admin); app.use('/api/assistant',assistant); app.use('/webhooks',webhooks);
app.use((err:any,_req:any,res:any,_next:any)=>{console.error(err);res.status(500).json({error:env.NODE_ENV==='production'?'Internal server error':err.message||'Internal server error'})});
app.listen(env.PORT,()=>console.log(`API listening on ${env.API_URL}`));

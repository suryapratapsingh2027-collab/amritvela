import { Router } from 'express'; import bcrypt from 'bcryptjs'; import { db } from '../db'; import { env } from '../config'; import { signAdmin } from '../utils/auth';
const r=Router();
r.post('/login',async(req,res)=>{const {email,password}=req.body||{};const u=await db.adminUser.findUnique({where:{email}});if(!u||!(await bcrypt.compare(password||'',u.passwordHash)))return res.status(401).json({error:'Invalid credentials'});res.json({token:signAdmin(u.id),user:{id:u.id,email:u.email,role:u.role}})});r.get('/config',(_,res)=>res.json({mockProviders:env.MOCK_PROVIDERS}));export default r;

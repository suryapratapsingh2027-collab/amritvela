import { Request,Response,NextFunction } from 'express';
import { verify } from '../utils/auth';
import { db } from '../db';
export async function auth(req:Request,res:Response,next:NextFunction){try{const h=req.headers.authorization;if(!h?.startsWith('Bearer ')) return res.status(401).json({error:'Unauthorized'});const payload=verify(h.slice(7));const user=await db.adminUser.findUnique({where:{id:payload.sub}});if(!user)return res.status(401).json({error:'Admin account not found'});(req as any).admin=user;next();}catch{return res.status(401).json({error:'Invalid or expired token'});}}

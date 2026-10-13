import jwt from 'jsonwebtoken'; import { env } from '../config';
export function signAdmin(id:string){return jwt.sign({sub:id},env.JWT_SECRET,{expiresIn:'7d'});}
export function verify(token:string){return jwt.verify(token,env.JWT_SECRET) as {sub:string};}

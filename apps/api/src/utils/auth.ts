import jwt from 'jsonwebtoken';
import { env } from '../config';

/** `tv` = AdminUser.tokenVersion. Changing/resetting a password bumps it, which instantly revokes older tokens. */
export function signAdmin(id: string, tokenVersion = 0) {
  return jwt.sign({ sub: id, tv: tokenVersion }, env.JWT_SECRET, { expiresIn: '7d' });
}
export function verify(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as { sub: string; tv?: number };
}

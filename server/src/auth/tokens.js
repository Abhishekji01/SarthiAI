import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/** Access token carries only the user id, token version and device session id. */
export function issueToken(user, { sid } = {}) {
  return jwt.sign({ ver: user.tokenVersion ?? 0, ...(sid ? { sid: String(sid) } : {}) }, env.JWT_SECRET, {
    subject: String(user._id),
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

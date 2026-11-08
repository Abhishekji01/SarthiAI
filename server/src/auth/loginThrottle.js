import { env } from '../config/env.js';
import { LoginThrottle } from '../models/LoginThrottle.js';
import { AppError } from '../utils/errors.js';

/**
 * Progressive slow-down after failed sign-ins, counted per email and per IP
 * (counters reset 15 minutes after the last failure, or on success):
 *   - first 4 failures: no delay
 *   - from the 5th: 1s, 2s, 4s … up to 15s before answering
 *   - 20 failures for one email (or 60 from one IP): refused for 15 minutes
 */
const FREE_FAILS = 4;
const LOCK = { email: 20, ip: 60 };
const baseDelay = () => (env.NODE_ENV === 'test' ? 5 : 1000);

const keysFor = (email, ip) => ({ email: `email:${email}`, ip: `ip:${ip ?? 'unknown'}` });

export async function beforeLogin(email, ip) {
  const k = keysFor(email, ip);
  const rows = await LoginThrottle.find({ key: { $in: [k.email, k.ip] } }).lean();
  const fails = { email: rows.find((r) => r.key === k.email)?.fails ?? 0, ip: rows.find((r) => r.key === k.ip)?.fails ?? 0 };
  if (fails.email >= LOCK.email || fails.ip >= LOCK.ip) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed sign-in attempts. Wait 15 minutes, or reset your password.');
  }
  const over = Math.max(fails.email, fails.ip) - FREE_FAILS;
  const delay = over > 0 ? Math.min(baseDelay() * 2 ** (over - 1), baseDelay() * 15) : 0;
  if (delay) await new Promise((r) => setTimeout(r, delay));
  return delay;
}

export async function recordFailure(email, ip) {
  const k = keysFor(email, ip);
  await LoginThrottle.bulkWrite([k.email, k.ip].map((key) => ({
    updateOne: { filter: { key }, update: { $inc: { fails: 1 }, $set: { lastFailAt: new Date() } }, upsert: true },
  })));
}

export async function recordSuccess(email) {
  await LoginThrottle.deleteOne({ key: keysFor(email).email });
}

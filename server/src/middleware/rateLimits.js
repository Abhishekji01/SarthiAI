import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

const json = (message) => (_req, res) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message } });

// Off in tests unless a test turns them on (RATE_LIMITS_IN_TESTS=true) to check them.
const isDisabled = () => env.NODE_ENV === 'test' && process.env.RATE_LIMITS_IN_TESTS !== 'true';
const disabled = env.NODE_ENV === 'test';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => disabled,
  handler: json('Too many requests. Please slow down.'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => disabled,
  handler: json('Too many sign-in attempts. Try again in a few minutes.'),
});

/** AI calls are limited per authenticated user, not per IP. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.AI_REQUESTS_PER_HOUR,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?._id ?? 'anon'),
  skip: () => disabled,
  handler: json('You have reached the hourly Sarthi AI limit. Try again later.'),
});

const ip = (req) => ipKeyGenerator(req.ip ?? '');
const emailKey = (req) => `email:${String(req.body?.email ?? '').trim().toLowerCase()}`;

/** Password-reset requests: per IP and per target email, so one address cannot be flooded. */
export const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: ip, skip: isDisabled, handler: json('Too many password reset requests. Try again in a few minutes.'),
});
export const forgotPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: emailKey, skip: isDisabled, handler: json('Too many password reset requests for this email. Try again later.'),
});
/** Reset attempts: per IP, and per account once the token identifies one (set by the route). */
export const resetPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: ip, skip: isDisabled, handler: json('Too many attempts. Try again in a few minutes.'),
});
export const resetPasswordEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => `reset:${req.resetEmail ?? 'unknown'}`, skip: (req) => isDisabled() || !req.resetEmail,
  handler: json('Too many attempts for this account. Request a new link later.'),
});

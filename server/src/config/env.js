import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment validation. The server refuses to start with an invalid
 * configuration instead of failing later in confusing ways.
 * GEMINI_API_KEY is optional: without it, AI routes respond 503 while all
 * other features keep working.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required').optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z.string().default(''),
  // Serve the built web app (../web/dist) from this server. Defaults to on when the build exists.
  SERVE_WEB: z.enum(['true', 'false']).optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  // Used automatically if GEMINI_MODEL is rejected as unknown. 'gemini-flash-latest' is Google's moving alias.
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-flash-latest'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(40),
  // Sign-up / sign-in requests per IP per 15 minutes (end-to-end tests raise it).
  AUTH_REQUESTS_PER_15_MIN: z.coerce.number().int().positive().default(20),
  ENABLE_DAILY_REFRESH: z.enum(['true', 'false']).optional(),
  REFRESH_HOUR_IST: z.coerce.number().int().min(0).max(23).default(3),
  REFRESH_ON_START: z.enum(['true', 'false']).default('false'),
  // Public URL of the web app, used for links in emails (password reset, verification, digests).
  // On Render, RENDER_EXTERNAL_URL is used when APP_URL is not set.
  APP_URL: z.string().url().optional(),
  RENDER_EXTERNAL_URL: z.string().url().optional(),
  // Email (Resend). Without both, emails are logged to the console in development and not sent in production.
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Development/e2e only: also append outgoing emails to this file.
  MAIL_OUTBOX_FILE: z.string().optional(),
  // Google sign-in (OpenID Connect). Off unless the flag is true AND both credentials are set.
  FEATURE_GOOGLE_SIGNIN: z.enum(['true', 'false']).default('false'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

function load() {
  // Blank lines copied from .env.example (e.g. `SERVE_WEB=`) mean "not set": use the default.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV !== 'test') {
    if (!env.MONGODB_URI) throw new Error('Invalid environment configuration:\n  - MONGODB_URI is required');
    if (!env.JWT_SECRET) throw new Error('Invalid environment configuration:\n  - JWT_SECRET is required (32+ chars)');
  }
  if (!env.JWT_SECRET && env.NODE_ENV === 'test') {
    env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
  }
  if (env.GEMINI_API_KEY === '') env.GEMINI_API_KEY = undefined;
  return Object.freeze(env);
}

export const env = load();

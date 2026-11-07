import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { issueToken } from './tokens.js';
import { Session } from '../models/Session.js';

/**
 * Two ways to hold a session:
 *  - Web app (sends X-Sarthi-Client: web): an httpOnly, SameSite=Lax cookie that
 *    page scripts cannot read, so an XSS bug cannot copy the session elsewhere.
 *  - Android app and API clients: a bearer token in the Authorization header
 *    (the WebView's origin differs from the API's, so cookies would be third-party).
 */
export const SESSION_COOKIE = 'sarthi_session';
export const CLIENT_HEADER = 'x-sarthi-client';

export const wantsCookie = (req) => req.get(CLIENT_HEADER) === 'web';

const cookieOptions = (req) => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || req.secure,
  sameSite: 'lax',
  path: '/api',
});

/**
 * Starts a session on this device: records it (so it can be signed out on its
 * own), then sets the cookie for the web app or returns a bearer token.
 */
export async function startSession(req, res, user, { forceCookie = false } = {}) {
  const kind = forceCookie || wantsCookie(req) ? 'cookie' : 'bearer';
  const session = new Session({ userId: user._id, kind, userAgent: String(req.get('user-agent') ?? '').slice(0, 200), expiresAt: new Date() });
  const token = issueToken(user, { sid: session._id });
  const exp = jwt.decode(token)?.exp;
  session.expiresAt = new Date(exp * 1000);
  await session.save();
  if (kind === 'bearer') return { token, session: 'bearer' };
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: exp ? exp * 1000 - Date.now() : undefined });
  return { token: null, session: 'cookie' };
}

export function endSession(req, res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

export function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie sessions. A state-changing request must carry the
 * custom client header (a cross-site page cannot add it without a CORS
 * preflight, which the CORS allow-list refuses) and, when the browser sends an
 * Origin, it must be this site or an allowed origin.
 */
export function csrfOk(req, allowedOrigins = []) {
  if (SAFE.has(req.method)) return true;
  if (!wantsCookie(req)) return false;
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const o = new URL(origin);
    return o.host === req.get('host') || allowedOrigins.includes(o.origin);
  } catch {
    return false;
  }
}

/** Signs out one device. */
export async function revokeSession(sid) {
  if (sid) await Session.updateOne({ _id: sid }, { $set: { revokedAt: new Date() } });
}

/** Signs out every device: all session records, plus any older token without a session id. */
export async function revokeAllSessions(userId) {
  const { User } = await import('../models/User.js');
  await Promise.all([
    Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } }),
    User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }),
  ]);
}

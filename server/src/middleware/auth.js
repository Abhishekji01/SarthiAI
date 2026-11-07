import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { verifyToken } from '../auth/tokens.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { csrfOk, readCookie, SESSION_COOKIE } from '../auth/session.js';
import { env } from '../config/env.js';

const allowedOrigins = () => env.CORS_ORIGINS.split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Authenticates the bearer token and loads the user. Identity always comes
 * from the token — never from a user id in the request body or query.
 */
export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const [scheme, bearer] = header.split(' ');
  let token = scheme === 'Bearer' && bearer ? bearer : null;
  if (!token) {
    // Web app: httpOnly session cookie, with CSRF checks on state-changing requests.
    token = readCookie(req, SESSION_COOKIE);
    if (token && !csrfOk(req, allowedOrigins())) throw forbidden('This request did not come from the SarthiAI app.');
    if (token) req.sessionVia = 'cookie';
  }
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  if (!mongoose.isValidObjectId(payload.sub)) throw unauthorized();
  const user = await User.findById(payload.sub);
  if (!user || (user.tokenVersion ?? 0) !== payload.ver) {
    throw unauthorized('Your session has ended. Please sign in again.');
  }
  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** Whether the admin may manage resources for the given college. */
export function canManageCollege(user, collegeId) {
  if (user.role === 'platform_admin') return true;
  if (user.role !== 'college_admin' || !collegeId) return false;
  return (user.adminCollegeIds ?? []).some((id) => String(id) === String(collegeId));
}

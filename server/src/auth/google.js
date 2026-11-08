import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { hashPassword } from './tokens.js';
import { appUrl } from '../mail/mailer.js';

/**
 * "Continue with Google" for the web app: OpenID Connect authorization-code flow
 * with PKCE, done on the server (no Google script on the page, so the strict CSP
 * stays). The ID token comes straight from Google's token endpoint over TLS, so
 * per OIDC Core 3.1.3.7 the TLS check stands in for the signature; issuer,
 * audience, expiry, nonce and email_verified are all checked.
 */
export const googleEnabled = () => env.FEATURE_GOOGLE_SIGNIN === 'true' && Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const OAUTH_COOKIE = 'sarthi_oauth';
const redirectUri = () => `${appUrl()}/api/auth/google/callback`;
const b64url = (buf) => buf.toString('base64url');

/** Starts the flow: returns Google's URL and a signed, short-lived state cookie value. */
export function beginGoogleSignIn(next) {
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: 'openid email profile',
    state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  const cookie = jwt.sign({ state, nonce, verifier, next: next ?? null }, env.JWT_SECRET, { expiresIn: '10m', algorithm: 'HS256' });
  return { url: `${AUTH_URL}?${params}`, cookie };
}

export class GoogleSignInError extends Error {}

/** Exchanges the code, checks the ID token, and returns { user, next }. */
export async function finishGoogleSignIn({ code, state, cookie }) {
  let saved;
  try { saved = jwt.verify(cookie ?? '', env.JWT_SECRET, { algorithms: ['HS256'] }); } catch { throw new GoogleSignInError('expired'); }
  if (!code || !state || state !== saved.state) throw new GoogleSignInError('state');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(), grant_type: 'authorization_code', code_verifier: saved.verifier }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new GoogleSignInError('token');
  const { id_token: idToken } = await res.json();
  const claims = jwt.decode(idToken);
  if (!claims
    || !['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)
    || claims.aud !== env.GOOGLE_CLIENT_ID
    || !claims.exp || claims.exp * 1000 < Date.now()
    || claims.nonce !== saved.nonce
    || !claims.sub || !claims.email || claims.email_verified !== true) throw new GoogleSignInError('claims');

  const email = String(claims.email).toLowerCase();
  let user = await User.findOne({ googleSub: claims.sub });
  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      // Google confirmed the address, so link the existing account to it.
      user.googleSub = claims.sub;
      user.emailVerifiedAt ??= new Date();
      await user.save();
    } else {
      const name = String(claims.name ?? email.split('@')[0]).replace(/<[^>]*>/g, '').trim().slice(0, 100) || 'Student';
      // No password yet: a random one nobody knows. "Forgot password" can set one later.
      user = await User.create({ name, email, googleSub: claims.sub, emailVerifiedAt: new Date(), passwordHash: await hashPassword(randomBytes(32).toString('hex')), role: 'student' });
    }
  }
  return { user, next: saved.next };
}

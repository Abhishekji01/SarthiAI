import { Router } from 'express';
import { User, serializeUser } from '../models/User.js';
import { hashPassword, verifyPassword } from '../auth/tokens.js';
import { endSession, revokeAllSessions, revokeSession, startSession } from '../auth/session.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, verifyResendLimiter, forgotPasswordEmailLimiter, forgotPasswordIpLimiter, resetPasswordEmailLimiter, resetPasswordIpLimiter } from '../middleware/rateLimits.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema } from '../validators/schemas.js';
import { sendVerificationEmail, verifyEmailToken } from '../auth/emailVerification.js';
import { beginGoogleSignIn, finishGoogleSignIn, googleEnabled, GoogleSignInError, OAUTH_COOKIE } from '../auth/google.js';
import { readCookie } from '../auth/session.js';
import { env } from '../config/env.js';
import { send } from '../utils/http.js';
import { badRequest, conflict, unauthorized } from '../utils/errors.js';
import { completePasswordReset, findUserByResetToken, requestPasswordReset } from '../auth/passwordReset.js';
import { logger } from '../utils/logger.js';
import { mailConfigured } from '../mail/mailer.js';
import { beforeLogin, recordFailure, recordSuccess } from '../auth/loginThrottle.js';

const router = Router();

/**
 * Registration always creates a student. The schema is strict, so a request
 * that includes `role` or admin fields is rejected outright.
 */
router.post('/register', authLimiter, validate({ body: registerSchema }), async (req, res) => {
  const { name, email, password } = req.valid.body;
  if (await User.exists({ email })) throw conflict('An account with this email already exists. Try signing in.');
  const user = await User.create({ name, email, passwordHash: await hashPassword(password), role: 'student' });
  sendVerificationEmail(user).catch((err) => logger.error('Verification email failed', { error: err }));
  send(res, { ...(await startSession(req, res, user)), user: serializeUser(user) }, { status: 201 });
});

router.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.valid.body;
  await beforeLogin(email, req.ip);
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await recordFailure(email, req.ip);
    throw unauthorized('Email or password is incorrect.');
  }
  await recordSuccess(email);
  send(res, { ...(await startSession(req, res, user)), user: serializeUser(user) });
});

const RESET_SENT_MESSAGE = 'If an account exists for that email, we have sent a link to reset the password. It expires in 30 minutes.';

/**
 * Always the same 200 response, whether or not the account exists. The email
 * is sent in the background so response time does not reveal it either.
 */
router.post('/forgot-password', forgotPasswordIpLimiter, validate({ body: forgotPasswordSchema }), forgotPasswordEmailLimiter, (req, res) => {
  requestPasswordReset(req.valid.body.email).catch((err) => logger.error('Password reset request failed', { error: err }));
  send(res, { sent: true, message: RESET_SENT_MESSAGE });
});

const INVALID_RESET = 'This reset link is invalid or has expired. Request a new one.';

router.post('/reset-password', resetPasswordIpLimiter, validate({ body: resetPasswordSchema }), async (req, res, next) => {
  const user = await findUserByResetToken(req.valid.body.token);
  if (!user) throw badRequest(INVALID_RESET, [{ field: 'token', message: INVALID_RESET }]);
  req.resetUser = user;
  req.resetEmail = user.email;
  next();
}, resetPasswordEmailLimiter, async (req, res) => {
  const updated = await completePasswordReset(req.resetUser, req.valid.body.password);
  if (!updated) throw badRequest(INVALID_RESET, [{ field: 'token', message: INVALID_RESET }]);
  // Every earlier session has ended; this response signs the student in on this device.
  send(res, { reset: true, ...(await startSession(req, res, updated)), user: serializeUser(updated) });
});

/**
 * Signs out this device only. (Tokens from older versions have no device id, so
 * for those every device is signed out, as before.)
 */
router.post('/logout', requireAuth, async (req, res) => {
  if (req.sessionId) await revokeSession(req.sessionId);
  else await revokeAllSessions(req.user._id);
  endSession(req, res);
  send(res, { signedOut: true, scope: req.sessionId ? 'this_device' : 'all_devices' });
});

/** What the sign-in screen can offer (feature flags). */
router.get('/config', (_req, res) => send(res, { googleSignIn: googleEnabled(), emailDelivery: mailConfigured() }));

const safeNext = (p) => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') && p.length < 300 ? p : null);
const oauthCookie = { httpOnly: true, sameSite: 'lax', path: '/api/auth/google', maxAge: 10 * 60 * 1000 };

router.get('/google/start', authLimiter, (req, res) => {
  if (!googleEnabled()) return res.redirect(302, '/welcome?error=google_off');
  const { url, cookie } = beginGoogleSignIn(safeNext(req.query.next));
  res.cookie(OAUTH_COOKIE, cookie, { ...oauthCookie, secure: env.NODE_ENV === 'production' || req.secure });
  res.redirect(302, url);
});

router.get('/google/callback', authLimiter, async (req, res) => {
  res.clearCookie(OAUTH_COOKIE, { path: oauthCookie.path });
  if (!googleEnabled()) return res.redirect(302, '/welcome?error=google_off');
  if (req.query.error) return res.redirect(302, '/welcome?error=google_cancelled');
  try {
    const { user, next } = await finishGoogleSignIn({ code: String(req.query.code ?? ''), state: String(req.query.state ?? ''), cookie: readCookie(req, OAUTH_COOKIE) });
    await startSession(req, res, user, { forceCookie: true });
    res.redirect(302, next ? `/welcome?next=${encodeURIComponent(next)}` : '/welcome');
  } catch (err) {
    if (!(err instanceof GoogleSignInError)) logger.error('Google sign-in failed', { error: err });
    res.redirect(302, '/welcome?error=google');
  }
});

/** Opened from the emailed link; works signed in or out. */
router.post('/verify-email', resetPasswordIpLimiter, validate({ body: verifyEmailSchema }), async (req, res) => {
  const user = await verifyEmailToken(req.valid.body.token);
  if (!user) throw badRequest('This confirmation link is invalid or has expired. Sign in and send a new one.', [{ field: 'token', message: 'Invalid or expired link' }]);
  send(res, { verified: true, email: user.email });
});

router.post('/verify-email/resend', requireAuth, verifyResendLimiter, async (req, res) => {
  const r = await sendVerificationEmail(req.user);
  send(res, { sent: r.sent, alreadyVerified: r.reason === 'already_verified' });
});

/** Signs out every device, including this one. */
router.post('/logout-all', requireAuth, async (req, res) => {
  await revokeAllSessions(req.user._id);
  endSession(req, res);
  send(res, { signedOut: true, scope: 'all_devices' });
});

/**
 * Moves an existing web session from a stored bearer token (older app versions
 * kept it in localStorage) to the httpOnly cookie. Same user, same token version.
 */
router.post('/session', requireAuth, async (req, res) => {
  if (req.sessionVia === 'cookie') return send(res, { session: 'cookie' });
  send(res, { ...(await startSession(req, res, req.user)) });
});

router.get('/me', requireAuth, (req, res) => send(res, { user: serializeUser(req.user) }));

export default router;

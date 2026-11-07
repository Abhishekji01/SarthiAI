import { Router } from 'express';
import { User, serializeUser } from '../models/User.js';
import { hashPassword, verifyPassword } from '../auth/tokens.js';
import { endSession, startSession } from '../auth/session.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, forgotPasswordEmailLimiter, forgotPasswordIpLimiter, resetPasswordEmailLimiter, resetPasswordIpLimiter } from '../middleware/rateLimits.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/schemas.js';
import { send } from '../utils/http.js';
import { badRequest, conflict, unauthorized } from '../utils/errors.js';
import { completePasswordReset, findUserByResetToken, requestPasswordReset } from '../auth/passwordReset.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * Registration always creates a student. The schema is strict, so a request
 * that includes `role` or admin fields is rejected outright.
 */
router.post('/register', authLimiter, validate({ body: registerSchema }), async (req, res) => {
  const { name, email, password } = req.valid.body;
  if (await User.exists({ email })) throw conflict('An account with this email already exists. Try signing in.');
  const user = await User.create({ name, email, passwordHash: await hashPassword(password), role: 'student' });
  send(res, { ...startSession(req, res, user), user: serializeUser(user) }, { status: 201 });
});

router.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password.
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw unauthorized('Email or password is incorrect.');
  send(res, { ...startSession(req, res, user), user: serializeUser(user) });
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
  send(res, { reset: true, ...startSession(req, res, updated), user: serializeUser(updated) });
});

/** Revokes every token issued to this user (all devices). */
router.post('/logout', requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  endSession(req, res);
  send(res, { signedOut: true });
});

/**
 * Moves an existing web session from a stored bearer token (older app versions
 * kept it in localStorage) to the httpOnly cookie. Same user, same token version.
 */
router.post('/session', requireAuth, (req, res) => {
  if (req.sessionVia === 'cookie') return send(res, { session: 'cookie' });
  send(res, { ...startSession(req, res, req.user) });
});

router.get('/me', requireAuth, (req, res) => send(res, { user: serializeUser(req.user) }));

export default router;

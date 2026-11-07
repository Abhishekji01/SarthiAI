import { createHash, randomBytes } from 'node:crypto';
import { User } from '../models/User.js';
import { hashPassword } from './tokens.js';
import { appUrl, sendMail, simpleEmail } from '../mail/mailer.js';

export const RESET_TTL_MS = 30 * 60 * 1000;
export const hashResetToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Starts a reset for this email if an account exists. The caller always
 * answers the same way, so this never reveals whether the account exists.
 */
export async function requestPasswordReset(email, now = new Date()) {
  const user = await User.findOne({ email });
  if (!user) return { sent: false };
  const token = randomBytes(32).toString('base64url');
  // A new request replaces any earlier link.
  await User.updateOne({ _id: user._id }, { $set: { passwordReset: { tokenHash: hashResetToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) } } });
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const body = simpleEmail({
    greetingName: user.name.split(' ')[0],
    paragraphs: [
      'Someone (hopefully you) asked to reset the password for your SarthiAI account.',
      'This link works once and expires in 30 minutes. If you did not ask for it, you can ignore this email; your password stays the same.',
    ],
    action: { label: 'Choose a new password', url },
  });
  await sendMail({ kind: 'password_reset', to: user.email, subject: 'Reset your SarthiAI password', ...body });
  return { sent: true };
}

export async function findUserByResetToken(token, now = new Date()) {
  return User.findOne({ 'passwordReset.tokenHash': hashResetToken(token), 'passwordReset.expiresAt': { $gt: now } }).select('+passwordReset');
}

/**
 * Sets the new password, consumes the token (single use) and ends every
 * existing session by bumping the token version.
 */
export async function completePasswordReset(user, newPassword) {
  const passwordHash = await hashPassword(newPassword);
  // Conditional update: a token can only be consumed once, even by two simultaneous requests.
  const updated = await User.findOneAndUpdate(
    { _id: user._id, 'passwordReset.tokenHash': user.passwordReset.tokenHash },
    { $set: { passwordHash }, $unset: { passwordReset: 1 }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' },
  );
  return updated;
}

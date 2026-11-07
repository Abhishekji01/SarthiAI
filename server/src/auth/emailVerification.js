import { createHash, randomBytes } from 'node:crypto';
import { User } from '../models/User.js';
import { appUrl, sendMail, simpleEmail } from '../mail/mailer.js';

/**
 * Email verification. Product decision: an unverified address can use every
 * feature; SarthiAI just doesn't send digests, deadline emails or alerts to it
 * until it is verified (canEmail). A banner asks the student to verify.
 */
export const VERIFY_TTL_MS = 48 * 3600 * 1000;
const hash = (t) => createHash('sha256').update(t).digest('hex');

export const canEmail = (user) => Boolean(user?.emailVerifiedAt);

export async function sendVerificationEmail(user, now = new Date()) {
  if (user.emailVerifiedAt) return { sent: false, reason: 'already_verified' };
  const token = randomBytes(32).toString('base64url');
  await User.updateOne({ _id: user._id }, { $set: { emailVerification: { tokenHash: hash(token), expiresAt: new Date(now.getTime() + VERIFY_TTL_MS) } } });
  const body = simpleEmail({
    greetingName: user.name.split(' ')[0],
    paragraphs: ['Please confirm this is your email address. Once it is, SarthiAI can send you deadline reminders and alerts here.', 'The link works for 48 hours. If you didn’t create a SarthiAI account, you can ignore this email.'],
    action: { label: 'Confirm my email', url: `${appUrl()}/verify-email?token=${encodeURIComponent(token)}` },
  });
  await sendMail({ kind: 'verify_email', to: user.email, subject: 'Confirm your email for SarthiAI', ...body });
  return { sent: true };
}

/** Marks the address verified if the token is valid; single use. */
export async function verifyEmailToken(token, now = new Date()) {
  const user = await User.findOneAndUpdate(
    { 'emailVerification.tokenHash': hash(token), 'emailVerification.expiresAt': { $gt: now } },
    { $set: { emailVerifiedAt: now }, $unset: { emailVerification: 1 } },
    { returnDocument: 'after' },
  );
  return user;
}

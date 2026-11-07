import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/schemas.js';
import { Opportunity, serializeOpportunity } from '../models/Opportunity.js';
import { send } from '../utils/http.js';
import { notFound } from '../utils/errors.js';
import jwt from 'jsonwebtoken';
import { deadlineIcs } from '../notify/ics.js';
import { appUrl } from '../mail/mailer.js';
import { User } from '../models/User.js';

/**
 * Public, read-only listing pages (shareable links). Only published listings
 * open to everyone (no college-only listings), and nothing personal.
 */
export const publicFilter = { status: 'published', collegeId: null };

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''), skip: () => env.NODE_ENV === 'test' && process.env.RATE_LIMITS_IN_TESTS !== 'true',
  handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } }),
});

export async function findPublicOpportunity(id) {
  return Opportunity.findOne({ _id: id, ...publicFilter }).lean();
}

/** The listing's official facts only: no match, saved state, tracker, or verifier notes. */
export function serializePublicOpportunity(o) {
  const { verificationNotes, collegeId, status, ...rest } = serializeOpportunity(o);
  return rest;
}

const router = Router();
router.use(publicLimiter);

router.get('/opportunities/:id', validate({ params: idParams }), async (req, res) => {
  const o = await findPublicOpportunity(req.valid.params.id);
  if (!o) throw notFound('Opportunity not found');
  res.set('Cache-Control', 'public, max-age=300');
  send(res, serializePublicOpportunity(o));
});

router.get('/opportunities/:id/calendar.ics', validate({ params: idParams }), async (req, res) => {
  const o = await findPublicOpportunity(req.valid.params.id);
  const ics = o && deadlineIcs(o, { url: `${appUrl()}/opportunity/${o._id}` });
  if (!ics) throw notFound('No published deadline for this listing');
  res.type('text/calendar').set('Content-Disposition', `attachment; filename="sarthiai-deadline-${o._id}.ics"`).send(ics);
});

const page = (title, text) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · SarthiAI</title><style>body{font-family:system-ui,sans-serif;background:#F2F2EE;color:#171B1F;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}main{max-width:420px;text-align:center}a{color:#133B39;font-weight:700}</style></head><body><main><h1>${title}</h1><p>${text}</p><p><a href="/profile">Email settings in SarthiAI</a></p></main></body></html>`;

/** One-click unsubscribe from an email link (signed token; no sign-in needed). */
router.get('/unsubscribe', async (req, res) => {
  let claims;
  try { claims = jwt.verify(String(req.query.token ?? ''), env.JWT_SECRET, { algorithms: ['HS256'] }); } catch { claims = null; }
  if (!claims || claims.purpose !== 'unsubscribe') return res.status(400).type('html').send(page('Link expired', 'This unsubscribe link is invalid or expired. You can turn emails off in Profile ▸ Reminders.'));
  const set = claims.kind === 'digest' ? { 'notificationPrefs.emailDigest': false }
    : claims.kind === 'deadlines' ? { 'notificationPrefs.emailDeadlines': false }
      : { 'notificationPrefs.emailDigest': false, 'notificationPrefs.emailDeadlines': false };
  await User.updateOne({ _id: claims.sub }, { $set: set });
  res.type('html').send(page('Unsubscribed', claims.kind === 'digest' ? 'You won’t get the weekly email any more.' : claims.kind === 'deadlines' ? 'You won’t get deadline emails any more.' : 'You won’t get emails from SarthiAI any more.'));
});

export default router;

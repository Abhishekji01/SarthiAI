import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/schemas.js';
import { Opportunity, serializeOpportunity } from '../models/Opportunity.js';
import { send } from '../utils/http.js';
import { notFound } from '../utils/errors.js';

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

export default router;

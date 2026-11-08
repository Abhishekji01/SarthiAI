import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { collegeQuerySchema } from '../validators/schemas.js';
import { Announcement, serializeAnnouncement } from '../models/Announcement.js';
import { College, serializeCollege } from '../models/College.js';
import { Resource, serializeResource } from '../models/Resource.js';
import { getDeadlines, getNextMoves } from '../services/nextMoves.js';
import { buildGapPlan, addPlanToRoadmap } from '../services/gapPlan.js';
import { presentRoadmap } from './roadmap.js';
import { escapeRegex, send } from '../utils/http.js';

export const campusRouter = Router();
campusRouter.use(requireAuth);

/** Published, unexpired announcements for the student's own college only. */
campusRouter.get('/announcements', async (req, res) => {
  const collegeId = req.user.profile?.collegeId;
  if (!collegeId) return send(res, [], { meta: { reason: 'no_college' } });
  const now = new Date();
  const [items, college] = await Promise.all([
    Announcement.find({
      collegeId,
      status: 'published',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ publishedAt: -1 }).limit(50).lean(),
    College.findById(collegeId).lean(),
  ]);
  send(res, items.map((a) => serializeAnnouncement(a, college?.name)));
});

/** Public college directory for onboarding search. */
export const collegesRouter = Router();
collegesRouter.get('/', validate({ query: collegeQuerySchema }), async (req, res) => {
  const filter = { listed: true };
  // Every word must match somewhere ("kiet ghaziabad" = name + city). Blank or spaces = the full list.
  const words = (req.valid.query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length) {
    filter.$and = words.map((w) => {
      const rx = new RegExp(escapeRegex(w), 'i');
      return { $or: [{ name: rx }, { shortName: rx }, { aliases: rx }, { city: rx }, { state: rx }] };
    });
  }
  const colleges = await College.find(filter).sort({ name: 1 }).limit(30).lean();
  send(res, colleges.map(serializeCollege));
});

export const meRouter = Router();
meRouter.use(requireAuth);
meRouter.get('/deadlines', async (req, res) => send(res, await getDeadlines(req.user)));
meRouter.get('/next-moves', async (req, res) => send(res, await getNextMoves(req.user)));
/** Gap-to-plan: what stands between the student and open opportunities, as a dated plan. */
meRouter.get('/plan', async (req, res) => send(res, await buildGapPlan(req.user)));
/** Adds the plan's steps to the active roadmap (never removes existing milestones). */
meRouter.post('/plan/roadmap', async (req, res) => {
  const plan = await buildGapPlan(req.user);
  const { roadmap, added } = await addPlanToRoadmap(req.user, plan);
  send(res, { added, roadmap: await presentRoadmap(roadmap) }, { status: 201 });
});

export const resourcesRouter = Router();
resourcesRouter.use(requireAuth);
resourcesRouter.get('/', async (_req, res) => {
  const resources = await Resource.find().sort({ title: 1 }).lean();
  send(res, resources.map(serializeResource));
});

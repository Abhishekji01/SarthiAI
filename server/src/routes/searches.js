import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams, savedSearchCreateSchema, savedSearchPatchSchema, searchQueryFromParams } from '../validators/schemas.js';
import { SavedSearch, serializeSavedSearch } from '../models/SavedSearch.js';
import { searchOpportunities } from '../services/opportunities.js';
import { send } from '../utils/http.js';
import { badRequest, notFound } from '../utils/errors.js';

const MAX_PER_STUDENT = 20;
const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const rows = await SavedSearch.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  send(res, rows.map(serializeSavedSearch));
});

router.post('/', validate({ body: savedSearchCreateSchema }), async (req, res) => {
  const { name, params, alerts } = req.valid.body;
  try { searchQueryFromParams(params); } catch { throw badRequest('Some filters in this search are invalid.'); }
  if (await SavedSearch.countDocuments({ userId: req.user._id }) >= MAX_PER_STUDENT) throw badRequest(`You can save up to ${MAX_PER_STUDENT} searches. Delete one first.`);
  const s = await SavedSearch.create({ userId: req.user._id, name, params, alerts, lastCheckedAt: new Date() });
  send(res, serializeSavedSearch(s), { status: 201 });
});

router.patch('/:id', validate({ params: idParams, body: savedSearchPatchSchema }), async (req, res) => {
  const s = await SavedSearch.findOne({ _id: req.valid.params.id, userId: req.user._id });
  if (!s) throw notFound('Saved search not found');
  Object.assign(s, req.valid.body);
  if (req.valid.body.alerts) s.lastCheckedAt = new Date();
  await s.save();
  send(res, serializeSavedSearch(s));
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  await SavedSearch.deleteOne({ _id: req.valid.params.id, userId: req.user._id });
  send(res, { deleted: true });
});

/** How many results the search has now (for the list). */
router.get('/:id/count', validate({ params: idParams }), async (req, res) => {
  const s = await SavedSearch.findOne({ _id: req.valid.params.id, userId: req.user._id }).lean();
  if (!s) throw notFound('Saved search not found');
  const { meta } = await searchOpportunities(req.user, { ...searchQueryFromParams(Object.fromEntries(Object.entries(s.params))), page: 1, limit: 1 });
  send(res, { total: meta.total });
});

export default router;

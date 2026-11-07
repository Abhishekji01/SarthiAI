import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { opportunityQuerySchema, idParams, eligibilityCheckSchema, matchesQuerySchema, eligibilityAnswerSchema, eligibilityAnswersQuery } from '../validators/schemas.js';
import { EligibilityAnswer, answersFor } from '../models/EligibilityAnswer.js';
import { badRequest } from '../utils/errors.js';
import { DateWatch } from '../models/Notification.js';
import { deadlineIcs } from '../notify/ics.js';
import { appUrl } from '../mail/mailer.js';
import { inPersonPlaces, openSummary, searchOpportunities, getVisibleOpportunity, recommendedMatches, userStateFor, presentWithMatch, visibilityFilter } from '../services/opportunities.js';
import { checkEligibility } from '../eligibility/engine.js';
import { SavedOpportunity } from '../models/SavedOpportunity.js';
import { Opportunity, serializeOpportunity } from '../models/Opportunity.js';
import { send } from '../utils/http.js';

export const opportunitiesRouter = Router();
opportunitiesRouter.use(requireAuth);

opportunitiesRouter.get('/', validate({ query: opportunityQuerySchema }), async (req, res) => {
  const { items, meta } = await searchOpportunities(req.user, req.valid.query);
  send(res, items, { meta });
});

opportunitiesRouter.get('/summary', async (req, res) => send(res, await openSummary(req.user)));

opportunitiesRouter.get('/places', validate({ query: opportunityQuerySchema }), async (req, res) => send(res, await inPersonPlaces(req.user, req.valid.query.type)));

opportunitiesRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const opp = await getVisibleOpportunity(req.user, req.valid.params.id);
  const state = await userStateFor(req.user, [opp._id]);
  send(res, presentWithMatch(opp, req.user, state).item);
});

/** Calendar file for the deadline (all-day, reminders 3 days and 1 day before). */
opportunitiesRouter.get('/:id/calendar.ics', validate({ params: idParams }), async (req, res) => {
  const opp = await getVisibleOpportunity(req.user, req.valid.params.id);
  const ics = deadlineIcs(opp, { url: `${appUrl()}/opportunity/${opp._id}` });
  if (!ics) throw badRequest('This listing has no published deadline yet.');
  res.type('text/calendar').set('Content-Disposition', `attachment; filename="sarthiai-deadline-${opp._id}.ics"`).send(ics);
});

/** "Notify me when dates are announced" (listings without a deadline). Also saves the listing. */
opportunitiesRouter.post('/:id/watch', validate({ params: idParams }), async (req, res) => {
  const opp = await getVisibleOpportunity(req.user, req.valid.params.id);
  if (opp.deadline) throw badRequest('This listing already has a deadline. Save it to get reminders.');
  await DateWatch.updateOne({ userId: req.user._id, opportunityId: opp._id }, { $set: { notifiedAt: null } }, { upsert: true });
  await SavedOpportunity.updateOne({ userId: req.user._id, opportunityId: opp._id }, { $setOnInsert: { userId: req.user._id, opportunityId: opp._id } }, { upsert: true });
  send(res, { opportunityId: String(opp._id), watchingDates: true, isSaved: true });
});

opportunitiesRouter.delete('/:id/watch', validate({ params: idParams }), async (req, res) => {
  await DateWatch.deleteOne({ userId: req.user._id, opportunityId: req.valid.params.id });
  send(res, { opportunityId: req.valid.params.id, watchingDates: false });
});

opportunitiesRouter.post('/:id/save', validate({ params: idParams }), async (req, res) => {
  const opp = await getVisibleOpportunity(req.user, req.valid.params.id);
  await SavedOpportunity.updateOne(
    { userId: req.user._id, opportunityId: opp._id },
    { $setOnInsert: { userId: req.user._id, opportunityId: opp._id } },
    { upsert: true },
  );
  send(res, { opportunityId: String(opp._id), isSaved: true });
});

opportunitiesRouter.delete('/:id/save', validate({ params: idParams }), async (req, res) => {
  await SavedOpportunity.deleteOne({ userId: req.user._id, opportunityId: req.valid.params.id });
  send(res, { opportunityId: req.valid.params.id, isSaved: false });
});

export const savedRouter = Router();
savedRouter.use(requireAuth);
savedRouter.get('/', async (req, res) => {
  const saved = await SavedOpportunity.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  const opps = await Opportunity.find({ _id: { $in: saved.map((s) => s.opportunityId) }, ...visibilityFilter(req.user) }).lean();
  const byId = new Map(opps.map((o) => [String(o._id), o]));
  const state = await userStateFor(req.user, opps.map((o) => o._id));
  send(res, saved.map((s) => byId.get(String(s.opportunityId))).filter(Boolean).map((o) => presentWithMatch(o, req.user, state).item));
});

export const matchesRouter = Router();
matchesRouter.use(requireAuth);
matchesRouter.get('/', validate({ query: matchesQuerySchema }), async (req, res) => {
  const { limit, tier } = req.valid.query;
  const { items, excludedIneligible, excludedRestricted, excludedUnconfirmed } = await recommendedMatches(req.user, { limit, tier });
  send(res, items, {
    meta: {
      excludedIneligible,
      excludedRestricted,
      excludedUnconfirmed,
      tier,
      criteria: 'Verified, open or upcoming listings that are not ruled out by a mandatory criterion or a group restriction, and whose fit is confirmed (a criterion met from your profile, or the role matches your goal). Roles that contradict your goal are never top recommendations. Everything still appears in Discover.',
    },
  });
});

export const eligibilityRouter = Router();
eligibilityRouter.use(requireAuth);
eligibilityRouter.post('/check', validate({ body: eligibilityCheckSchema }), async (req, res) => {
  const opp = await getVisibleOpportunity(req.user, req.valid.body.opportunityId);
  const saved = (await answersFor(req.user._id, [opp._id])).get(String(opp._id)) ?? {};
  // Remembered answers, overridden by any given with this request.
  const declarations = { ...saved, ...(req.valid.body.declarations ?? {}) };
  const result = checkEligibility(opp, req.user.profile, { declarations });
  send(res, { ...result, savedAnswers: saved, opportunity: serializeOpportunity(opp) });
});

/** The student's remembered Yes/No answers (all, or for one listing). */
eligibilityRouter.get('/answers', validate({ query: eligibilityAnswersQuery }), async (req, res) => {
  const map = await answersFor(req.user._id, req.valid.query.opportunityId ? [req.valid.query.opportunityId] : undefined);
  send(res, Object.fromEntries(map));
});

/** Remembers (or, with answer: null, forgets) one answer. Only for criteria the student confirms themselves. */
eligibilityRouter.put('/answers', validate({ body: eligibilityAnswerSchema }), async (req, res) => {
  const { opportunityId, key, answer } = req.valid.body;
  const opp = await getVisibleOpportunity(req.user, opportunityId);
  const rule = (opp.eligibilityRules ?? []).find((r) => r.key === key);
  if (!rule || rule.kind !== 'self_declared') throw badRequest('Only criteria you confirm yourself can be answered.', [{ field: 'key', message: 'Not a self-declared criterion of this listing' }]);
  const filter = { userId: req.user._id, opportunityId: opp._id, key };
  if (answer === null) await EligibilityAnswer.deleteOne(filter);
  else await EligibilityAnswer.updateOne(filter, { $set: { answer } }, { upsert: true });
  send(res, { opportunityId, key, answer });
});

/** Forgets the student's answers for one listing, or all of them. */
eligibilityRouter.delete('/answers', validate({ query: eligibilityAnswersQuery }), async (req, res) => {
  const r = await EligibilityAnswer.deleteMany({ userId: req.user._id, ...(req.valid.query.opportunityId ? { opportunityId: req.valid.query.opportunityId } : {}) });
  send(res, { cleared: r.deletedCount });
});

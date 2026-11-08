import { Opportunity, OPPORTUNITY_TYPES, computeAvailability, serializeOpportunity } from '../models/Opportunity.js';
import { matchesPlace, placeLabel, proximity, PROXIMITY, userPlaces } from '../matching/places.js';
import { SavedOpportunity } from '../models/SavedOpportunity.js';
import { Application } from '../models/Application.js';
import { answersFor } from '../models/EligibilityAnswer.js';
import { DateWatch } from '../models/Notification.js';
import { checkEligibility, degreeMatches } from '../eligibility/engine.js';
import { scoreOpportunity, rankMatches } from '../matching/engine.js';
import { rankByQuery } from '../matching/search.js';
import { assertObjectId, paginate } from '../utils/http.js';
import { notFound } from '../utils/errors.js';

const MAX_CANDIDATES = 500;

/**
 * Students see published public listings plus published listings for their
 * own college. Nothing else.
 */
export function visibilityFilter(user) {
  const collegeId = user.profile?.collegeId ?? null;
  return {
    status: 'published',
    $or: collegeId ? [{ collegeId: null }, { collegeId }] : [{ collegeId: null }],
  };
}

export async function getVisibleOpportunity(user, id) {
  assertObjectId(id, 'Opportunity');
  const opp = await Opportunity.findOne({ _id: id, ...visibilityFilter(user) }).lean();
  if (!opp) throw notFound('Opportunity not found');
  return opp;
}

export async function userStateFor(user, opportunityIds) {
  const [saved, apps, answers, watches] = await Promise.all([
    SavedOpportunity.find({ userId: user._id, opportunityId: { $in: opportunityIds } }).select('opportunityId').lean(),
    Application.find({ userId: user._id, opportunityId: { $in: opportunityIds } }).select('opportunityId status archived').lean(),
    answersFor(user._id, opportunityIds),
    DateWatch.find({ userId: user._id, opportunityId: { $in: opportunityIds }, notifiedAt: null }).select('opportunityId').lean(),
  ]);
  return {
    answers,
    watching: new Set(watches.map((w) => String(w.opportunityId))),
    saved: new Set(saved.map((s) => String(s.opportunityId))),
    apps: new Map(apps.map((a) => [String(a.opportunityId), { id: String(a._id), status: a.status, archived: a.archived }])),
  };
}

/** Builds the list item returned to clients, with match explanation. */
export function presentWithMatch(opp, user, state, now = new Date()) {
  // The student's remembered Yes/No answers count in checks and rankings.
  const eligibility = checkEligibility(opp, user.profile, { now, declarations: state.answers?.get(String(opp._id)) ?? {} });
  const match = scoreOpportunity(opp, user.profile, { now, eligibility });
  const id = String(opp._id);
  return {
    opportunity: opp,
    match,
    item: serializeOpportunity(opp, {
      match: {
        score: match.score,
        scoreLabel: match.scoreLabel,
        eligibilityOverall: match.eligibilityOverall,
        hardBlocked: match.hardBlocked,
        audienceRestricted: match.audienceRestricted,
        confirmedFit: match.confirmedFit,
        confidence: match.confidence,
        roleFit: match.roleFit,
        factors: match.factors,
      },
      isSaved: state.saved.has(id),
      watchingDates: state.watching?.has(id) ?? false,
      tracked: state.apps.get(id) ?? null,
    }),
  };
}

export async function searchOpportunities(user, q, now = new Date()) {
  const filter = { ...visibilityFilter(user) };
  const and = [];
  if (q.type) filter.opportunityType = q.type;
  if (q.workMode) filter.workMode = q.workMode;
  if (q.verifiedOnly) filter.verificationStatus = 'verified';
  if (q.campusOnly) {
    filter.collegeId = user.profile?.collegeId ?? '000000000000000000000000';
    delete filter.$or;
  }
  // Free text is ranked in memory (synonyms, phrases, typos), not regex-filtered in Mongo.
  if (q.deadlineWithinDays || q.deadlineBefore) {
    const end = q.deadlineBefore ?? new Date(now.getTime() + q.deadlineWithinDays * 86400000);
    filter.deadline = { $gte: now, $lte: end };
  }
  if (and.length) filter.$and = and;

  let docs = await Opportunity.find(filter).limit(MAX_CANDIDATES).lean();
  const allDocs = docs;

  // Derived-state filters (availability depends on "now").
  docs = docs.filter((o) => {
    const availability = computeAvailability(o, now);
    if (q.availability) return availability === q.availability;
    return q.includeClosed ? true : availability !== 'closed';
  });
  if (q.location) {
    // Picking a city for hackathons or contests means events there, not every online one.
    const strict = q.type === 'hackathon' || q.type === 'competition';
    docs = docs.filter((o) => matchesPlace(o, q.location, { strict }));
  }
  if (q.hasPrize) docs = docs.filter((o) => o.award?.amount != null || o.award?.description);
  if (q.minAnnualAmount) docs = docs.filter((o) => Math.max(annualAmount(o.stipend), annualAmount(o.award)) >= q.minAnnualAmount);
  if (q.degree) docs = docs.filter((o) => !o.eligibleDegrees?.length || degreeMatches(o.eligibleDegrees, q.degree));
  if (q.year) docs = docs.filter((o) => !o.eligibleYears?.length || o.eligibleYears.includes(q.year));
  if (q.skills?.length) {
    // Skill filter is alias-aware too ("ML" finds "Machine Learning").
    const { results } = rankByQuery(docs, q.skills.join(' '));
    const keep = new Set(results.map((r) => r.doc));
    docs = docs.filter((d) => keep.has(d));
  }

  let textMeta = null;
  const relevanceById = new Map();
  if (q.q) {
    const ranked = rankByQuery(docs, q.q, { includeMentions: q.mentions });
    textMeta = { relaxed: ranked.relaxed, terms: ranked.terms, hiddenMentions: ranked.hiddenMentions };
    // Nothing open matched: tell the client how many closed listings did, so it can offer them.
    if (!ranked.results.length && !q.includeClosed && !q.availability) {
      const closed = allDocs.filter((o) => computeAvailability(o, now) === 'closed');
      textMeta.closedMatches = closed.length ? rankByQuery(closed, q.q).results.length : 0;
    }
    for (const r of ranked.results) relevanceById.set(String(r.doc._id), r);
    docs = ranked.results.map((r) => r.doc);
  }

  const state = await userStateFor(user, docs.map((d) => d._id));
  let rows = docs.map((o) => {
    const row = presentWithMatch(o, user, state, now);
    const rel = relevanceById.get(String(o._id));
    if (rel) {
      // Text relevance leads when the student typed a query; profile fit breaks ties.
      row.rankScore = rel.relevance * 70 + row.match.score * 0.3;
      row.item.searchMatch = { relevance: Math.round(rel.relevance * 100), matchedTerms: rel.matchedTerms, approximate: rel.approximate };
    }
    return row;
  });

  // Sarthi's "what can I apply to" lists leave out listings a required criterion rules out (and say how many).
  let excludedLikelyIneligible = 0;
  if (q.excludeLikelyIneligible || q.hideIneligible) {
    const before = rows.length;
    rows = rows.filter((r) => r.match.eligibilityOverall !== 'likely_ineligible');
    excludedLikelyIneligible = before - rows.length;
  }

  const places = userPlaces(user);
  for (const r of rows) {
    r.proximity = proximity(r.opportunity, places);
    r.item.nearby = r.proximity === PROXIMITY.SAME_CITY ? 'city' : r.proximity === PROXIMITY.SAME_STATE ? 'state' : null;
  }

  if (q.sort === 'nearby') {
    // Closest first; within the same distance, soonest deadline first.
    const due = (r) => (r.opportunity.deadline ? new Date(r.opportunity.deadline).getTime() : Infinity);
    rows.sort((a, b) => b.proximity - a.proximity || due(a) - due(b));
  } else if (q.sort === 'deadline') {
    rows.sort((a, b) => (a.opportunity.deadline ? new Date(a.opportunity.deadline) : Infinity) - (b.opportunity.deadline ? new Date(b.opportunity.deadline) : Infinity));
  } else if (q.sort === 'recent') {
    rows.sort((a, b) => new Date(b.opportunity.updatedAt) - new Date(a.opportunity.updatedAt));
  } else {
    rows = rankMatches(rows);
  }

  const { items, meta } = paginate(rows, q.page, q.limit);
  const nearby = q.sort === 'nearby' ? { places, count: rows.filter((r) => r.item.nearby).length } : undefined;
  return { items: items.map((r) => r.item), meta: { ...meta, ...(textMeta ? { search: textMeta } : {}), ...(nearby ? { nearby } : {}), ...(q.excludeLikelyIneligible || q.hideIneligible ? { excludedLikelyIneligible } : {}) } };
}

/**
 * Per-type counts for the Home tiles. "open" uses exactly Find's default filter
 * (visible to the student, not closed), so Home and Find always agree. The
 * eligibility split is secondary: most scholarships need a detail the student
 * has not shared yet, which must not make them disappear from the count.
 */
export async function openSummary(user, now = new Date()) {
  const docs = await Opportunity.find(visibilityFilter(user)).limit(MAX_CANDIDATES).lean();
  const answers = await answersFor(user._id);
  const types = Object.fromEntries(OPPORTUNITY_TYPES.map((t) => [t, { open: 0, likelyEligible: 0, needDetails: 0, likelyIneligible: 0, closingIn30Days: 0 }]));
  const in30 = now.getTime() + 30 * 86400000;
  for (const o of docs) {
    if (computeAvailability(o, now) === 'closed') continue;
    const t = types[o.opportunityType];
    if (!t) continue;
    t.open += 1;
    const overall = checkEligibility(o, user.profile, { now, declarations: answers.get(String(o._id)) ?? {} }).overall;
    if (overall === 'all_criteria_met') t.likelyEligible += 1;
    else if (overall === 'missing_information') t.needDetails += 1;
    else if (overall === 'likely_ineligible') t.likelyIneligible += 1;
    if (o.deadline && new Date(o.deadline).getTime() <= in30) t.closingIn30Days += 1;
  }
  return { types };
}

/** A stated amount as rupees per year (monthly x12; one-time and totals as stated). Unknown = 0. */
export function annualAmount(m) {
  if (!m || m.amount == null || (m.currency && m.currency !== 'INR')) return 0;
  return m.period === 'per_month' ? m.amount * 12 : m.amount;
}

/** Cities with open in-person listings of a type, busiest first (for the Discover city picker). */
export async function inPersonPlaces(user, type, now = new Date()) {
  const docs = await Opportunity.find({ ...visibilityFilter(user), ...(type ? { opportunityType: type } : {}) }).limit(MAX_CANDIDATES).lean();
  const counts = new Map();
  for (const o of docs) {
    const label = computeAvailability(o, now) === 'closed' ? null : placeLabel(o);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/**
 * Recommendations that claim current availability: verified, not closed,
 * not hard-blocked by a mandatory criterion.
 *
 * `tier: 'all'` adds a second, clearly labelled tier ("possible") of listings
 * that are open and not ruled out, but where SarthiAI could not confirm a fit
 * (nothing checkable, or a group restriction the student must confirm).
 */
export async function recommendedMatches(user, { limit = 10, now = new Date(), tier = 'recommended', possibleLimit = 15 } = {}) {
  const docs = await Opportunity.find({ ...visibilityFilter(user), verificationStatus: 'verified' }).limit(MAX_CANDIDATES).lean();
  const open = docs.filter((o) => ['open', 'upcoming'].includes(computeAvailability(o, now)));
  const state = await userStateFor(user, open.map((d) => d._id));
  const ranked = rankMatches(open.map((o) => presentWithMatch(o, user, state, now)));
  // Recommended = not ruled out, and relevance confirmed: a criterion met from the profile, or the
  // role is exactly what the student is aiming for. A role that contradicts their goal never is.
  const isRecommended = (r) => !r.match.hardBlocked && !r.match.audienceRestricted && r.match.roleFit !== 'mismatch'
    && (r.match.confirmedFit || r.match.roleFit === 'match');
  const recommended = ranked.filter(isRecommended).slice(0, limit).map((r) => ({ ...r.item, tier: 'recommended' }));
  const possible = tier === 'all'
    ? ranked.filter((r) => !r.match.hardBlocked && !isRecommended(r)).slice(0, possibleLimit).map((r) => ({ ...r.item, tier: 'possible' }))
    : [];
  return {
    items: [...recommended, ...possible],
    excludedIneligible: ranked.filter((r) => r.match.hardBlocked).length,
    excludedRestricted: ranked.filter((r) => !r.match.hardBlocked && r.match.audienceRestricted).length,
    excludedUnconfirmed: ranked.filter((r) => !r.match.hardBlocked && !r.match.audienceRestricted && !r.match.confirmedFit).length,
  };
}

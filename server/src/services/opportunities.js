import { Opportunity, computeAvailability, serializeOpportunity } from '../models/Opportunity.js';
import { SavedOpportunity } from '../models/SavedOpportunity.js';
import { Application } from '../models/Application.js';
import { checkEligibility, degreeMatches } from '../eligibility/engine.js';
import { scoreOpportunity, rankMatches } from '../matching/engine.js';
import { rankByQuery } from '../matching/search.js';
import { assertObjectId, escapeRegex, paginate } from '../utils/http.js';
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
  const [saved, apps] = await Promise.all([
    SavedOpportunity.find({ userId: user._id, opportunityId: { $in: opportunityIds } }).select('opportunityId').lean(),
    Application.find({ userId: user._id, opportunityId: { $in: opportunityIds } }).select('opportunityId status archived').lean(),
  ]);
  return {
    saved: new Set(saved.map((s) => String(s.opportunityId))),
    apps: new Map(apps.map((a) => [String(a.opportunityId), { id: String(a._id), status: a.status, archived: a.archived }])),
  };
}

/** Builds the list item returned to clients, with match explanation. */
export function presentWithMatch(opp, user, state, now = new Date()) {
  const eligibility = checkEligibility(opp, user.profile, { now });
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
        factors: match.factors,
      },
      isSaved: state.saved.has(id),
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
  if (q.location) {
    const rx = new RegExp(escapeRegex(q.location), 'i');
    and.push({ $or: [{ 'location.city': rx }, { 'location.state': rx }, { 'location.description': rx }, { 'location.isNationwide': true }] });
  }
  if (q.deadlineWithinDays) {
    filter.deadline = { $gte: now, $lte: new Date(now.getTime() + q.deadlineWithinDays * 86400000) };
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

  if (q.sort === 'deadline') {
    rows.sort((a, b) => (a.opportunity.deadline ? new Date(a.opportunity.deadline) : Infinity) - (b.opportunity.deadline ? new Date(b.opportunity.deadline) : Infinity));
  } else if (q.sort === 'recent') {
    rows.sort((a, b) => new Date(b.opportunity.updatedAt) - new Date(a.opportunity.updatedAt));
  } else {
    rows = rankMatches(rows);
  }

  const { items, meta } = paginate(rows, q.page, q.limit);
  return { items: items.map((r) => r.item), meta: textMeta ? { ...meta, search: textMeta } : meta };
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
  const isRecommended = (r) => !r.match.hardBlocked && !r.match.audienceRestricted && r.match.confirmedFit;
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

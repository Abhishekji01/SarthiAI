import { checkEligibility, OVERALL, normalizeDegree } from '../eligibility/engine.js';
import { computeAvailability } from '../models/Opportunity.js';
import { calendarDaysUntil } from '../utils/dates.js';
import { canonical, compareSkills, relatedness, conceptLabel } from './taxonomy.js';
import { contentTokens } from './search.js';

/**
 * Explainable relevance ranking. Hard eligibility (deterministic engine) is
 * kept separate from relevance: a failed mandatory criterion always pushes a
 * listing below every eligible one, whatever its relevance.
 *
 * Accuracy upgrades over the original exact-string scorer:
 *  - skills are compared through an alias/related-concept taxonomy
 *    ("JS" == "JavaScript"; React experience counts partly towards JavaScript);
 *  - skills evidenced in the student's projects/experience count too;
 *  - interests are matched as concepts against tags, type, title and text;
 *  - the student's career goal is compared with the listing's content.
 *
 * The score is a heuristic "match strength" (0–100), NOT a probability of
 * selection.
 */

const WEIGHTS = { skills: 30, interests: 20, education: 20, goal: 10, preferences: 10, timing: 10 };

/** Skills the student lists, plus skills used in their projects/experience. */
export function studentSkillEvidence(p) {
  const listed = (p.skills ?? []).filter(Boolean);
  const fromProjects = (p.projects ?? []).flatMap((x) => x.skills ?? []);
  const listedIds = new Set(listed.map(canonical));
  const extra = [...new Set(fromProjects)].filter((s) => s && !listedIds.has(canonical(s)));
  return { listed, fromProjects: extra, all: [...listed, ...extra] };
}

function opportunityConcepts(opp) {
  const text = [opp.title, opp.summary, opp.officialDescription, ...(opp.tags ?? []), opp.opportunityType].filter(Boolean).join(' ');
  const { tokens, concepts } = contentTokens(text);
  for (const t of opp.tags ?? []) concepts.add(canonical(t));
  concepts.add(canonical(opp.opportunityType));
  return { tokens, concepts };
}

export function scoreOpportunity(opp, profile, { now = new Date(), eligibility } = {}) {
  const p = profile ?? {};
  const factors = [];
  const elig = eligibility ?? checkEligibility(opp, p, { now });
  const oppC = opportunityConcepts(opp);

  // ---- Skills (alias + related aware, with project evidence) ----
  const evidence = studentSkillEvidence(p);
  const required = opp.requiredSkills ?? [];
  const preferred = opp.preferredSkills ?? [];
  const oppSkills = [...required, ...preferred];
  let skillsScore;
  if (oppSkills.length) {
    const cmp = compareSkills(evidence.all, oppSkills);
    // Required skills weigh double; related skills earn partial credit.
    const weightOf = (s) => (required.includes(s) ? 2 : 1);
    const total = oppSkills.reduce((sum, s) => sum + weightOf(s), 0);
    const earned = cmp.exact.reduce((sum, m) => sum + weightOf(m.skill), 0)
      + cmp.related.reduce((sum, m) => sum + weightOf(m.skill) * m.weight * 0.6, 0);
    skillsScore = (earned / total) * WEIGHTS.skills;
    if (cmp.exact.length) {
      const fromProj = cmp.exact.filter((m) => evidence.fromProjects.includes(m.yours)).map((m) => m.skill);
      factors.push({ factor: 'skills', positive: true, detail: `You have ${cmp.exact.map((m) => m.skill).join(', ')}, which this asks for${fromProj.length ? ` (${fromProj.join(', ')} from your projects)` : ''}.` });
    }
    if (cmp.related.length) {
      factors.push({ factor: 'skills', positive: true, detail: `Related experience: your ${cmp.related.map((m) => `${m.yours} → ${m.skill}`).join(', ')}.` });
    }
    if (cmp.missing.length) factors.push({ factor: 'skills', positive: false, detail: `Not in your profile yet: ${cmp.missing.slice(0, 4).join(', ')}.` });
  } else if (evidence.all.length) {
    // No published skill list: use overlap between the student's skills and the listing's topics.
    const hits = evidence.all.filter((s) => oppC.concepts.has(canonical(s)));
    skillsScore = hits.length ? WEIGHTS.skills * Math.min(1, 0.55 + hits.length * 0.15) : WEIGHTS.skills / 2;
    if (hits.length) factors.push({ factor: 'skills', positive: true, detail: `It mentions ${hits.slice(0, 3).join(', ')}, which you know.` });
  } else {
    skillsScore = WEIGHTS.skills / 2;
  }

  // ---- Interests as concepts (exact or related) ----
  const interests = (p.interests ?? []).filter(Boolean);
  let interestScore = 0;
  if (interests.length) {
    const hits = [];
    let credit = 0;
    for (const i of interests) {
      const id = canonical(i);
      if (oppC.concepts.has(id) || oppC.tokens.has(id)) {
        hits.push(i);
        credit += 1;
        continue;
      }
      let best = 0;
      for (const c of oppC.concepts) best = Math.max(best, relatedness(id, c));
      if (best >= 0.6) {
        hits.push(i);
        credit += best * 0.7;
      }
    }
    interestScore = Math.min(1, credit / Math.min(2, interests.length)) * WEIGHTS.interests;
    if (hits.length) factors.push({ factor: 'interests', positive: true, detail: `Matches your interest in ${hits.join(', ')}.` });
  }

  // ---- Education compatibility (from deterministic results) ----
  const edu = elig.criteria.filter((c) => ['degree_in', 'year_in', 'branch_in', 'graduation_year_in'].includes(c.kind));
  let eduScore = WEIGHTS.education / 2;
  if (edu.length) {
    const met = edu.filter((c) => c.status === 'met');
    eduScore = (met.length / edu.length) * WEIGHTS.education;
    for (const c of met) factors.push({ factor: 'education', positive: true, detail: c.explanation });
    for (const c of edu.filter((x) => x.status === 'unmet')) factors.push({ factor: 'education', positive: false, detail: c.explanation });
  } else if (p.degree && (opp.eligibleDegrees ?? []).map(normalizeDegree).includes(normalizeDegree(p.degree))) {
    eduScore = WEIGHTS.education;
  }

  // ---- Career goal vs listing content ----
  let goalScore = WEIGHTS.goal / 2;
  const goalText = [p.careerGoal, p.headline].filter(Boolean).join(' ');
  if (goalText) {
    const g = contentTokens(goalText);
    const conceptHits = [...g.concepts].filter((c) => oppC.concepts.has(c));
    const relatedHit = !conceptHits.length && [...g.concepts].some((c) => [...oppC.concepts].some((o) => relatedness(c, o) >= 0.6));
    const tokenHits = [...g.tokens].filter((t) => oppC.tokens.has(t));
    if (conceptHits.length || tokenHits.length >= 2) {
      goalScore = WEIGHTS.goal;
      factors.push({ factor: 'goal', positive: true, detail: `Fits your goal${conceptHits.length ? ` (${conceptHits.slice(0, 2).map(conceptLabel).join(', ')})` : ''}.` });
    } else if (relatedHit || tokenHits.length === 1) {
      goalScore = WEIGHTS.goal * 0.7;
    } else {
      goalScore = WEIGHTS.goal * 0.3;
    }
  }

  // ---- Work mode / location preferences ----
  let prefScore = WEIGHTS.preferences / 2;
  if ((p.workModes ?? []).length && ['remote', 'hybrid', 'onsite'].includes(opp.workMode)) {
    const ok = p.workModes.includes(opp.workMode);
    prefScore = ok ? WEIGHTS.preferences : 0;
    factors.push({ factor: 'work_mode', positive: ok, detail: ok ? `It is ${opp.workMode}, which you prefer.` : `It is ${opp.workMode}; you prefer ${p.workModes.join(' or ')}.` });
  } else if ((p.preferredLocations ?? []).length && (opp.location?.city || opp.location?.state)) {
    const loc = `${opp.location.city ?? ''} ${opp.location.state ?? ''}`.toLowerCase();
    const ok = p.preferredLocations.some((l) => loc.includes(String(l).toLowerCase()));
    prefScore = ok ? WEIGHTS.preferences : WEIGHTS.preferences / 4;
    if (ok) factors.push({ factor: 'location', positive: true, detail: 'Located in a place you prefer.' });
  } else if (opp.location?.isNationwide) {
    prefScore = WEIGHTS.preferences * 0.8;
  }

  // ---- Timing ----
  const availability = computeAvailability(opp, now);
  let timingScore = 0;
  if (availability === 'open') {
    timingScore = WEIGHTS.timing;
    if (opp.deadline) {
      const days = calendarDaysUntil(opp.deadline, now);
      factors.push({ factor: 'deadline', positive: true, detail: days <= 14 ? `Open now — closes in ${days} day${days === 1 ? '' : 's'}.` : 'Open now with a verified deadline.' });
    }
  } else if (availability === 'upcoming') timingScore = WEIGHTS.timing * 0.6;
  else if (availability === 'unknown') {
    timingScore = WEIGHTS.timing * 0.3;
    factors.push({ factor: 'deadline', positive: false, detail: 'Current application dates could not be verified.' });
  }

  // Audience-restricted criteria (gender, disability, existing awardee…) are
  // never inferred. Until the student confirms them, flag them first and do
  // not present the listing as a recommendation.
  const restricted = elig.criteria.filter((c) => c.mandatory && c.restrictsAudience && c.status !== 'met');
  for (const c of restricted) {
    factors.unshift({ factor: 'audience', positive: false, detail: `Only for: ${c.requirement.charAt(0).toLowerCase()}${c.requirement.slice(1)}. Check whether this applies to you.` });
  }

  // Uncertainty: each mandatory criterion SarthiAI cannot confirm lowers confidence.
  const unknownMandatory = elig.criteria.filter((c) => c.mandatory && c.status === 'unknown');
  const uncertaintyPenalty = Math.min(30, unknownMandatory.length * 4 + restricted.length * 10);
  if (unknownMandatory.length) {
    factors.push({ factor: 'uncertainty', positive: false, detail: `${unknownMandatory.length} required criteri${unknownMandatory.length === 1 ? 'on needs' : 'a need'} your confirmation.` });
  }

  const raw = skillsScore + interestScore + eduScore + goalScore + prefScore + timingScore - uncertaintyPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const confirmedFit = elig.counts.met > 0;
  const hardBlocked = elig.overall === OVERALL.LIKELY_INELIGIBLE;
  const audienceRestricted = restricted.length > 0;

  return {
    score,
    scoreLabel: 'Heuristic match strength — not a probability of selection',
    // Plain-language confidence in the score, from how much could be checked.
    confidence: hardBlocked ? 'low' : (confirmedFit && unknownMandatory.length === 0 && !audienceRestricted ? 'high' : confirmedFit ? 'medium' : 'low'),
    eligibilityOverall: elig.overall,
    hardBlocked,
    audienceRestricted,
    // At least one published criterion was checked against the student's profile and met.
    // Without this, relevance rests on keywords alone, so it is not a top recommendation.
    confirmedFit,
    availability,
    factors,
  };
}

/** Sort: eligible before blocked; then by score; ties by nearest deadline. */
export function rankMatches(items) {
  return items.sort((a, b) => {
    if (a.match.hardBlocked !== b.match.hardBlocked) return a.match.hardBlocked ? 1 : -1;
    const sa = a.rankScore ?? a.match.score;
    const sb = b.rankScore ?? b.match.score;
    if (sb !== sa) return sb - sa;
    const da = a.opportunity.deadline ? new Date(a.opportunity.deadline).getTime() : Infinity;
    const db = b.opportunity.deadline ? new Date(b.opportunity.deadline).getTime() : Infinity;
    return da - db;
  });
}

import { Opportunity, computeAvailability } from '../models/Opportunity.js';
import { Resource, serializeResource } from '../models/Resource.js';
import { Roadmap } from '../models/Roadmap.js';
import { checkEligibility } from '../eligibility/engine.js';
import { scoreOpportunity, studentSkillEvidence } from '../matching/engine.js';
import { canonical, compareSkills, conceptLabel, relatedness } from '../matching/taxonomy.js';
import { visibilityFilter } from './opportunities.js';
import { calendarDaysUntil } from '../utils/dates.js';

/**
 * Gap-to-plan: turns near-misses into a dated plan.
 *
 * For every open opportunity the student can see, the deterministic eligibility
 * engine and matcher say what stands in the way. Gaps are sorted into:
 *   - fixable now: profile details SarthiAI cannot check yet (quick wins),
 *     required skills the student does not have, a year of experience;
 *   - not fixable now: degree / branch / batch / state, group restrictions,
 *     or a criterion the student said they do not meet. These are counted, never planned.
 * Skills are ranked by how many opportunities they would unlock (the last missing
 * requirement), how many fit the student's goal, and how soon those close.
 * No model is involved, so nothing is invented; effort figures are labelled estimates.
 */

const DAY = 86400000;
const PROFILE_FIELDS = {
  degree_in: { field: 'degree', label: 'Add your degree' },
  branch_in: { field: 'branch', label: 'Add your branch' },
  year_in: { field: 'currentYear', label: 'Add your current year of study' },
  graduation_year_in: { field: 'graduationYear', label: 'Add your graduation year' },
  min_cgpa: { field: 'cgpa', label: 'Add your CGPA' },
  skills_all: { field: 'skills', label: 'Add your skills' },
  skills_any: { field: 'skills', label: 'Add your skills' },
};
const NOT_FIXABLE_NOW = new Set(['degree_in', 'branch_in', 'graduation_year_in', 'home_state_in', 'max_family_income', 'year_in', 'self_declared', 'gender_in', 'category_in', 'disability_required', 'minority_required', 'parent_service_in', 'first_generation_required']);

/** Rough learning time (weeks at ~5–6 hours/week) for a working level. Always shown as an estimate. */
const EFFORT_WEEKS = {
  git: 1, html: 2, sql: 2, linux: 2, databases: 3, statistics: 4, python: 4, java: 4, javascript: 4, typescript: 2,
  react: 4, nodejs: 4, django: 3, springboot: 4, cpp: 4, c: 3, go: 3, kotlin: 4, swift: 4, flutter: 4,
  backend: 4, frontend: 4, webdevelopment: 6, android: 6, ios: 6, mobiledevelopment: 6, cloud: 4, devops: 4,
  networking: 4, cybersecurity: 6, dsa: 6, competitiveprogramming: 8, datascience: 6, machinelearning: 8,
  deeplearning: 8, nlp: 6, computervision: 6, ai: 8, uiux: 4, embedded: 6, vlsi: 8, iot: 4, communication: 2,
};
const effortOf = (id) => EFFORT_WEEKS[id] ?? 3;

const brief = (o, match, now) => ({
  id: String(o._id),
  title: o.title,
  organization: o.organization,
  opportunityType: o.opportunityType,
  deadline: o.deadline ?? null,
  daysLeft: o.deadline ? calendarDaysUntil(o.deadline, now) : null,
  matchScore: match.score,
  fitsGoal: match.roleFit === 'match',
});

export async function buildGapPlan(user, { now = new Date(), horizonDays = 90 } = {}) {
  const p = user.profile ?? {};
  const docs = await Opportunity.find({ ...visibilityFilter(user), verificationStatus: 'verified' }).limit(800).lean();
  const evidence = studentSkillEvidence(p);

  const skills = new Map(); // canonical id -> aggregate
  const quickWins = new Map(); // profile field -> { label, field, count, examples }
  const experience = [];
  const counts = { considered: 0, readyNow: 0, notFixable: 0, roleMismatch: 0, restricted: 0, closed: 0 };

  for (const o of docs) {
    const availability = computeAvailability(o, now);
    if (availability === 'closed') { counts.closed += 1; continue; }
    const elig = checkEligibility(o, p, { now });
    const match = scoreOpportunity(o, p, { now, eligibility: elig });
    counts.considered += 1;
    if (match.audienceRestricted) { counts.restricted += 1; continue; }
    if (match.roleFit === 'mismatch') { counts.roleMismatch += 1; continue; }

    const mandatoryUnmet = elig.criteria.filter((c) => c.mandatory && c.status === 'unmet');
    // Skills rules are handled below as learnable gaps; everything else unmet is not fixable now.
    const blocking = mandatoryUnmet.filter((c) => NOT_FIXABLE_NOW.has(c.kind) && c.key !== 'experience');
    if (blocking.length) { counts.notFixable += 1; continue; }

    // Profile details SarthiAI cannot check yet (instant wins).
    for (const c of elig.criteria.filter((x) => x.status === 'unknown' && PROFILE_FIELDS[x.kind])) {
      const q = PROFILE_FIELDS[c.kind];
      if (q.field === 'skills' && (p.skills ?? []).length) continue;
      if (q.field === 'currentYear' && p.graduationYear) continue; // estimated from graduation year already
      const entry = quickWins.get(q.field) ?? { ...q, count: 0, examples: [] };
      entry.count += 1;
      if (entry.examples.length < 3) entry.examples.push(brief(o, match, now));
      quickWins.set(q.field, entry);
    }

    if (elig.criteria.some((c) => c.key === 'experience' && c.status !== 'met')) experience.push(brief(o, match, now));

    // Learnable skill gaps: required skills first; preferred skills only strengthen.
    const required = compareSkills(evidence.all, o.requiredSkills ?? []).missing;
    const preferred = compareSkills(evidence.all, o.preferredSkills ?? []).missing;
    if (!required.length && !preferred.length) {
      counts.readyNow += 1;
      continue;
    }
    const requiredIds = [...new Set(required.map(canonical))];
    for (const s of [...required, ...preferred]) {
      const id = canonical(s);
      const isRequired = requiredIds.includes(id);
      const agg = skills.get(id) ?? {
        id, skill: s, label: conceptLabel(id) === id ? s : conceptLabel(id), unlocks: 0, required: 0, strengthens: 0, fitsGoal: 0,
        nearestDeadline: null, opportunities: [],
      };
      if (isRequired) {
        agg.required += 1;
        if (requiredIds.length === 1) agg.unlocks += 1; // the last missing requirement
      } else {
        agg.strengthens += 1;
      }
      if (match.roleFit === 'match') agg.fitsGoal += 1;
      if (o.deadline && new Date(o.deadline) > now && (!agg.nearestDeadline || new Date(o.deadline) < new Date(agg.nearestDeadline))) {
        agg.nearestDeadline = o.deadline;
      }
      if (!agg.opportunities.some((x) => x.id === String(o._id))) agg.opportunities.push({ ...brief(o, match, now), required: isRequired });
      skills.set(id, agg);
    }
  }

  // Rank: unlocking > required > goal fit > merely preferred; soon deadlines break ties.
  const ranked = [...skills.values()]
    .map((s) => {
      const urgency = s.nearestDeadline ? Math.max(0, 1 - calendarDaysUntil(s.nearestDeadline, now) / 120) : 0;
      return { ...s, priority: s.unlocks * 4 + s.required * 2 + s.fitsGoal * 2 + s.strengthens * 0.5 + urgency * 2 };
    })
    .filter((s) => s.required > 0 || s.strengthens >= 2)
    .sort((a, b) => b.priority - a.priority);

  // Verified learning resources for the top skills (catalogue only — never invented links).
  const resources = (await Resource.find().lean()).map(serializeResource);
  const resourcesFor = (id) => resources.filter((r) => r.skills.some((k) => canonical(k) === id)).slice(0, 3);

  // ---- The dated plan -------------------------------------------------------
  const steps = [];
  let cursor = new Date(now.getTime());
  const wins = [...quickWins.values()].sort((a, b) => b.count - a.count);
  if (wins.length) {
    steps.push({
      kind: 'profile', title: 'Quick wins: complete your profile', weeks: 0,
      detail: wins.map((w) => `${w.label} — lets SarthiAI check ${w.count} more listing${w.count === 1 ? '' : 's'}`).join('; '),
      startsAt: cursor.toISOString(), targetDate: new Date(cursor.getTime() + 3 * DAY).toISOString(),
    });
    cursor = new Date(cursor.getTime() + 3 * DAY);
  }
  const MAX_SKILL_STEPS = 4;
  for (const s of ranked) {
    if (steps.filter((x) => x.kind === 'skill').length >= MAX_SKILL_STEPS) break;
    // Closely related skills (SQL ~ Databases) are learned together: one step, not two.
    if (steps.some((x) => x.skillId && relatedness(x.skillId, s.id) >= 0.8)) continue;
    const weeks = effortOf(s.id);
    // A long skill that no longer fits does not end the plan: a shorter one may still fit.
    if ((cursor - now) / DAY + weeks * 7 > horizonDays) continue;
    const end = new Date(cursor.getTime() + weeks * 7 * DAY);
    steps.push({
      kind: 'skill', skillId: s.id, title: `Learn ${s.label}`, weeks, effortEstimate: `${weeks} week${weeks === 1 ? '' : 's'} at 5–6 hours/week (estimate)`,
      detail: s.unlocks
        ? `The last missing requirement for ${s.unlocks} opportunit${s.unlocks === 1 ? 'y' : 'ies'}; required by ${s.required} in total.`
        : `Required by ${s.required} and preferred by ${s.strengthens} open opportunit${s.required + s.strengthens === 1 ? 'y' : 'ies'}.`,
      startsAt: cursor.toISOString(), targetDate: end.toISOString(),
      resources: resourcesFor(s.id),
      applyTo: s.opportunities.filter((x) => x.required).sort((a, b) => (b.fitsGoal - a.fitsGoal) || (b.matchScore - a.matchScore)).slice(0, 5),
    });
    cursor = end;
  }
  if (experience.length) {
    steps.push({
      kind: 'experience', title: 'Get your first internship', weeks: null,
      detail: `${experience.length} role${experience.length === 1 ? ' asks' : 's ask'} for about a year of experience. Internships usually count — apply to internships alongside your learning.`,
      startsAt: null, targetDate: null, applyTo: experience.slice(0, 3),
    });
  }

  const unlockable = new Set(ranked.flatMap((s) => (s.unlocks ? s.opportunities.filter((x) => x.required).map((x) => x.id) : [])));
  const plannedSkills = steps.filter((x) => x.kind === 'skill');
  const plannedUnlocks = new Set(ranked.filter((s) => plannedSkills.some((x) => x.skillId === s.id))
    .flatMap((s) => (s.unlocks ? s.opportunities.filter((x) => x.required).map((x) => x.id) : [])));

  return {
    generatedAt: now.toISOString(),
    horizonDays,
    headline: plannedSkills.length
      ? `Learn ${plannedSkills.map((x) => x.title.replace(/^Learn /, '')).join(', then ')} to unlock ${plannedUnlocks.size} more opportunit${plannedUnlocks.size === 1 ? 'y' : 'ies'} in ${horizonDays} days.`
      : wins.length ? 'Complete your profile so SarthiAI can check more opportunities for you.' : 'No skill gaps found among open opportunities right now.',
    summary: { ...counts, unlockable: unlockable.size, plannedUnlocks: plannedUnlocks.size },
    quickWins: wins,
    skills: ranked.slice(0, 8).map(({ priority, ...s }) => ({ ...s, effortWeeks: effortOf(s.id), opportunities: s.opportunities.slice(0, 5), resources: resourcesFor(s.id) })),
    experience: experience.slice(0, 5),
    steps,
    note: 'Built from open, verified listings and your profile. Effort figures are estimates. Listings you cannot apply to now (degree, branch, batch, state, or a group you have not confirmed) are not planned for.',
  };
}

/** Adds the plan's steps to the student's active roadmap (creating one if needed). Never removes milestones. */
export async function addPlanToRoadmap(user, plan) {
  let roadmap = await Roadmap.findOne({ userId: user._id, status: 'active' });
  if (!roadmap) {
    roadmap = new Roadmap({ userId: user._id, goal: user.profile?.careerGoal || 'My 90-day plan', generatedBy: 'student', milestones: [] });
  }
  const existing = new Set(roadmap.milestones.map((m) => m.title.toLowerCase()));
  let added = 0;
  const firstSkill = plan.steps.find((x) => x.kind === 'skill');
  for (const s of plan.steps.filter((x) => x.kind !== 'experience')) {
    if (existing.has(s.title.toLowerCase())) continue;
    roadmap.milestones.push({
      title: s.title,
      purpose: s.detail.slice(0, 600),
      steps: s.kind === 'skill'
        ? [`Study ${s.title.replace(/^Learn /, '')}: ${s.effortEstimate}`, ...(s.applyTo ?? []).slice(0, 3).map((o) => `Then apply: ${o.title} — ${o.organization}`.slice(0, 300))]
        : [s.detail.slice(0, 300)],
      skills: s.skillId ? [s.title.replace(/^Learn /, '').slice(0, 40)] : [],
      effortEstimate: s.effortEstimate ?? null,
      priority: s.kind === 'profile' || s === firstSkill ? 'high' : 'medium', // quick wins and the top skill come first
      verifiedResourceIds: (s.resources ?? []).map((r) => r.id),
      targetDate: s.targetDate ? new Date(s.targetDate) : null,
      order: roadmap.milestones.length,
      source: 'plan',
    });
    added += 1;
  }
  await roadmap.save();
  return { roadmap, added };
}

// Shared with the profile forms (shared/profileRules.js).
import { DEGREE_YEARS } from '../../../shared/profileRules.js';
import { computeAvailability, isStale, PRIVATE_RULE_KINDS } from '../models/Opportunity.js';
import { evaluateAudience, GROUPS } from './audience.js';
import { compareSkills, canonicalState, ALL_INDIA } from '../matching/taxonomy.js';

/**
 * Deterministic eligibility engine.
 *
 * Each criterion is evaluated against the student's own profile and returns
 * met / unmet / unknown with an explanation and next step. The LLM never
 * participates here; AI features may only *explain* these results.
 *
 * `declarations` are per-check, student-provided answers for criteria SarthiAI
 * cannot verify (e.g. "I hold a valid income certificate"). They are used
 * only for this evaluation and are never stored.
 */

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const DEGREE_ALIASES = {
  btech: 'btech', bacheloroftechnology: 'btech', btechhons: 'btech', btechlateral: 'btech',
  be: 'be', bachelorofengineering: 'be',
  bsc: 'bsc', bachelorofscience: 'bsc', bschons: 'bsc', bs: 'bs', bsresearch: 'bs',
  bca: 'bca', bachelorofcomputerapplications: 'bca',
  bcom: 'bcom', bachelorofcommerce: 'bcom', bcomhons: 'bcom',
  ba: 'ba', bachelorofarts: 'ba', bahons: 'ba', bba: 'bba', bbm: 'bba', bms: 'bba', bachelorofbusinessadministration: 'bba',
  barch: 'barch', bachelorofarchitecture: 'barch', bpharm: 'bpharm', bpharma: 'bpharm', bachelorofpharmacy: 'bpharm',
  mbbs: 'mbbs', bds: 'bds', bams: 'bams', bhms: 'bhms', bpt: 'bpt', bsn: 'bscnursing', bscnursing: 'bscnursing',
  llb: 'llb', ballb: 'llb', bballb: 'llb', bdes: 'bdes', bachelorofdesign: 'bdes', bvoc: 'bvoc', bed: 'bed', bfa: 'bfa', bhm: 'bhm',
  mtech: 'mtech', masteroftechnology: 'mtech', me: 'me', masterofengineering: 'me',
  msc: 'msc', masterofscience: 'msc', ms: 'ms', msresearch: 'ms', mca: 'mca', masterofcomputerapplications: 'mca',
  mba: 'mba', pgdm: 'mba', masterofbusinessadministration: 'mba', ma: 'ma', masterofarts: 'ma', mcom: 'mcom', mpharm: 'mpharm', llm: 'llm', mdes: 'mdes',
  diploma: 'diploma', polytechnic: 'diploma', polytechnicdiploma: 'diploma', iti: 'iti',
  integrated: 'integrated', dualdegree: 'integrated', integratedmtech: 'integrated', integratedmsc: 'integrated', bsms: 'integrated', idd: 'integrated',
  phd: 'phd', doctorate: 'phd', mphil: 'mphil',
};
export const normalizeDegree = (d) => DEGREE_ALIASES[norm(d)] ?? norm(d);

const UG = ['btech', 'be', 'bsc', 'bs', 'bca', 'bcom', 'ba', 'bba', 'barch', 'bpharm', 'mbbs', 'bds', 'bams', 'bhms', 'bpt', 'bscnursing', 'llb', 'bdes', 'bvoc', 'bed', 'bfa', 'bhm', 'integrated'];
const PG = ['mtech', 'me', 'msc', 'ms', 'mca', 'mba', 'ma', 'mcom', 'mpharm', 'llm', 'mdes', 'integrated'];
/** Rule values that name a group of degrees rather than one degree. */
const DEGREE_FAMILIES = {
  anydegree: [...UG, ...PG, 'diploma', 'phd', 'mphil'], any: [...UG, ...PG, 'diploma', 'phd', 'mphil'], alldegrees: [...UG, ...PG, 'diploma', 'phd', 'mphil'],
  ug: UG, undergraduate: UG, graduation: UG, bachelors: UG, bachelor: UG, anyundergraduate: UG, anybachelorsdegree: UG,
  pg: PG, postgraduate: PG, masters: PG, master: PG, anypostgraduate: PG,
  engineering: ['btech', 'be', 'mtech', 'me', 'integrated'], beb_tech: ['btech', 'be'], bebtech: ['btech', 'be'], btechbe: ['btech', 'be'],
  science: ['bsc', 'bs', 'msc', 'ms', 'integrated'], medical: ['mbbs', 'bds', 'bams', 'bhms'], professional: ['btech', 'be', 'mbbs', 'bds', 'llb', 'barch', 'bpharm', 'mba', 'mca'],
};
/** Degree "acceptance set" for a rule value: a family expands to all its degrees. */
export function degreeMatches(values, degree) {
  const d = normalizeDegree(degree);
  return values.some((v) => {
    const fam = DEGREE_FAMILIES[norm(v)];
    return fam ? fam.includes(d) : normalizeDegree(v) === d;
  });
}

/** Typical programme length, used only to estimate year of study when it is missing. */

/**
 * Academic year in India runs roughly July–June. A student graduating in the
 * summer of `gradYear` with an N-year degree is in year N - (gradYear - endOfThisAcademicYear).
 */
export function estimateCurrentYear(p, now = new Date()) {
  if (p.currentYear) return { year: Number(p.currentYear), estimated: false };
  const len = DEGREE_YEARS[normalizeDegree(p.degree)];
  if (!p.graduationYear || !len) return null;
  const academicYearEnd = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const year = len - (Number(p.graduationYear) - academicYearEnd);
  return year >= 1 && year <= len ? { year, estimated: true } : null;
}

export function estimateGraduationYear(p, now = new Date()) {
  if (p.graduationYear) return { year: Number(p.graduationYear), estimated: false };
  const len = DEGREE_YEARS[normalizeDegree(p.degree)];
  if (!p.currentYear || !len) return null;
  const academicYearEnd = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return { year: academicYearEnd + (len - Number(p.currentYear)), estimated: true };
}

const BRANCH_ALIASES = {
  cse: 'cse', computerscience: 'cse', computerscienceandengineering: 'cse', computerscienceengineering: 'cse', cs: 'cse',
  it: 'it', informationtechnology: 'it',
  ece: 'ece', electronicsandcommunication: 'ece', electronicsandcommunicationengineering: 'ece',
  ee: 'ee', eee: 'ee', electricalengineering: 'ee', electricalandelectronicsengineering: 'ee', electrical: 'ee',
  me: 'mech', mech: 'mech', mechanical: 'mech', mechanicalengineering: 'mech',
  ce: 'civil', civil: 'civil', civilengineering: 'civil',
  aiml: 'aiml', artificialintelligenceandmachinelearning: 'aiml', csaiml: 'aiml',
  ds: 'datascience', datascience: 'datascience', csds: 'datascience',
  cybersecurity: 'cybersecurity', cscybersecurity: 'cybersecurity', csecybersecurity: 'cybersecurity',
  cseaiml: 'aiml', computerscienceaiml: 'aiml', computerscienceandengineeringaiml: 'aiml', ai: 'aiml', artificialintelligence: 'aiml', aids: 'aiml', artificialintelligenceanddatascience: 'aiml',
  cseds: 'datascience', computersciencedatascience: 'datascience',
  csit: 'it', cseit: 'it', computerscienceandinformationtechnology: 'it',
  eie: 'eie', electronicsandinstrumentation: 'eie', ice: 'eie', instrumentation: 'eie',
  electronics: 'ece', electronicsengineering: 'ece', ec: 'ece', etc: 'ece', electronicsandtelecommunication: 'ece', entc: 'ece',
  chemical: 'chemical', chemicalengineering: 'chemical', che: 'chemical',
  biotech: 'biotech', biotechnology: 'biotech', bt: 'biotech',
  aerospace: 'aero', aeronautical: 'aero', aeronauticalengineering: 'aero', aerospaceengineering: 'aero',
  automobile: 'auto', automobileengineering: 'auto', production: 'production', productionengineering: 'production',
  mechatronics: 'mechatronics', robotics: 'robotics', roboticsandautomation: 'robotics',
  metallurgy: 'metallurgy', metallurgicalengineering: 'metallurgy', mining: 'mining', textile: 'textile',
  mathematics: 'maths', maths: 'maths', mathematicsandcomputing: 'mnc', mnc: 'mnc', physics: 'physics', chemistry: 'chemistry',
};
export const normalizeBranch = (b) => BRANCH_ALIASES[norm(b)] ?? norm(b);
const ANY_BRANCH = new Set(['any', 'anybranch', 'allbranches', 'anydiscipline', 'alldisciplines', 'anystream', 'allstreams', 'anyspecialisation', 'anyspecialization']);
/** Specialisations commonly offered as part of a parent branch. Matching a parent is reported as "unknown — check", not met. */
const BRANCH_PARENT = { aiml: 'cse', datascience: 'cse', cybersecurity: 'cse', it: 'cse', mnc: 'cse', eie: 'ece', mechatronics: 'mech', auto: 'mech', production: 'mech', robotics: 'mech' };

const fmtINR = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const list = (arr) => arr.join(', ');

function result(rule, status, studentValue, explanation, nextStep, { isPrivate = PRIVATE_RULE_KINDS.has(rule.kind) } = {}) {
  return {
    private: isPrivate,
    key: rule.key,
    kind: rule.kind,
    requirement: rule.label,
    mandatory: rule.mandatory !== false,
    studentValue: studentValue ?? null,
    status,
    explanation,
    nextStep: nextStep ?? null,
    sourceExcerpt: rule.sourceExcerpt ?? null,
    restrictsAudience: Boolean(rule.restrictsAudience),
  };
}

function evaluateRule(rule, profile, declarations, now = new Date()) {
  const p = profile ?? {};
  const values = rule.values ?? [];
  switch (rule.kind) {
    case 'degree_in': {
      if (!p.degree) return result(rule, 'unknown', null, 'Your degree is not in your profile.', 'Add your degree in Profile.');
      const ok = degreeMatches(values, p.degree);
      return ok
        ? result(rule, 'met', p.degree, `Your degree (${p.degree}) is listed: ${list(values)}.`)
        : result(rule, 'unmet', p.degree, `This requires ${list(values)}; your profile says ${p.degree}.`,
          'If your profile is wrong, update it. Otherwise look for similar opportunities open to your degree.');
    }
    case 'branch_in': {
      if (!p.branch) return result(rule, 'unknown', null, 'Your branch is not in your profile.', 'Add your branch in Profile.');
      if (values.some((v) => ANY_BRANCH.has(norm(v)))) return result(rule, 'met', p.branch, `Open to all branches, including yours (${p.branch}).`);
      const mine = normalizeBranch(p.branch);
      const accepted = values.map(normalizeBranch);
      if (accepted.includes(mine)) return result(rule, 'met', p.branch, `Your branch (${p.branch}) is eligible.`);
      // A specialisation of a listed parent branch (e.g. CSE-AIML when CSE is listed) is plausible but
      // not certain: report it as unknown with a precise next step instead of guessing either way.
      if (BRANCH_PARENT[mine] && accepted.includes(BRANCH_PARENT[mine])) {
        return result(rule, 'unknown', p.branch, `Eligible branches: ${list(values)}. Yours (${p.branch}) is a specialisation of a listed branch.`,
          'Check whether the source accepts specialisations of the listed branch, then confirm.');
      }
      return result(rule, 'unmet', p.branch, `Eligible branches: ${list(values)}. Yours: ${p.branch}.`,
        'Check the official source in case related branches are accepted.');
    }
    case 'year_in': {
      const est = estimateCurrentYear(p, now);
      if (!est) return result(rule, 'unknown', null, 'Your current year of study is not in your profile.', 'Add your current year in Profile.');
      const cy = est.year;
      const how = est.estimated ? ' (estimated from your graduation year — add your current year in Profile to confirm)' : '';
      const years = values.map(Number);
      const ok = years.includes(cy);
      return ok
        ? result(rule, 'met', `Year ${cy}`, `You are in year ${cy}${how}; eligible years: ${list(values)}.`)
        : result(rule, 'unmet', `Year ${cy}`, `Only year ${list(values)} students are eligible; you are in year ${cy}${how}.`,
          years.some((y) => y > cy) ? 'You may qualify in a future cycle — save it and check again next year.' : null);
    }
    case 'graduation_year_in': {
      const est = estimateGraduationYear(p, now);
      if (!est) return result(rule, 'unknown', null, 'Your graduation year is not in your profile.', 'Add your graduation year in Profile.');
      const how = est.estimated ? ' (estimated from your current year — add your graduation year in Profile to confirm)' : '';
      const ok = values.map(Number).includes(est.year);
      return ok
        ? result(rule, 'met', String(est.year), `Graduating in ${est.year} is eligible${how}.`)
        : result(rule, 'unmet', String(est.year), `Eligible graduation years: ${list(values)}; yours is ${est.year}${how}.`);
    }
    case 'min_cgpa': {
      if (Number(rule.numberValue) > 10) {
        return result(rule, 'unknown', p.cgpa != null ? `CGPA ${p.cgpa}` : null,
          `This asks for at least ${rule.numberValue}% marks. Percentages and CGPA use different scales, so SarthiAI does not convert between them.`,
          'Check your percentage on your mark sheet (or your university\'s official CGPA-to-percentage formula) and confirm.');
      }
      if (p.cgpa == null) return result(rule, 'unknown', null, `Requires a CGPA of at least ${rule.numberValue}. Your CGPA is not in your profile.`, 'Add your CGPA in Profile (optional).');
      const ok = Number(p.cgpa) >= Number(rule.numberValue);
      return ok
        ? result(rule, 'met', `CGPA ${p.cgpa}`, `Your CGPA ${p.cgpa} meets the minimum of ${rule.numberValue}.`)
        : result(rule, 'unmet', `CGPA ${p.cgpa}`, `Requires at least ${rule.numberValue}; yours is ${p.cgpa}.`,
          'Confirm the CGPA scale used by the source; scales differ between institutions.');
    }
    case 'max_family_income': {
      if (p.annualFamilyIncomeINR == null) {
        return result(rule, 'unknown', null,
          `Annual family income must not exceed ${fmtINR(rule.numberValue)}. You have not shared income in SarthiAI (optional).`,
          'Check this against your income certificate, or add it privately in Profile to have SarthiAI check it.');
      }
      const ok = Number(p.annualFamilyIncomeINR) <= Number(rule.numberValue);
      return ok
        ? result(rule, 'met', 'Within limit', `Your stated family income is within the ${fmtINR(rule.numberValue)} limit.`)
        : result(rule, 'unmet', 'Above limit', `Your stated family income is above the ${fmtINR(rule.numberValue)} limit.`,
          'If your stated income is out of date, update it in Profile.');
    }
    case 'home_state_in': {
      if (!p.homeState) return result(rule, 'unknown', null, `Restricted to: ${list(values)}. Your home state is not in your profile.`, 'Add your home state in Profile (optional).');
      const ok = values.some((v) => ALL_INDIA.has(norm(v))) || values.map(canonicalState).includes(canonicalState(p.homeState));
      return ok
        ? result(rule, 'met', p.homeState, `Your home state (${p.homeState}) is eligible.`)
        : result(rule, 'unmet', p.homeState, `Restricted to: ${list(values)}.`);
    }
    case 'skills_all':
    case 'skills_any': {
      const mySkills = [...(p.skills ?? []), ...(p.projects ?? []).flatMap((x) => x.skills ?? [])];
      if (mySkills.length === 0) return result(rule, 'unknown', null, 'You have not added skills yet.', 'Add your skills in Profile.');
      // Alias-aware: "JS" satisfies "JavaScript". Related skills do not satisfy a requirement.
      const cmp = compareSkills(mySkills, values);
      const have = cmp.exact.map((m) => m.skill);
      const missing = values.filter((v) => !have.includes(v));
      const ok = rule.kind === 'skills_all' ? missing.length === 0 : have.length > 0;
      return ok
        ? result(rule, 'met', list(have), `You list ${list(have)}.`)
        : result(rule, 'unmet', have.length ? list(have) : 'None listed',
          `Missing: ${list(missing)}.`, `Build and evidence ${list(missing.slice(0, 3))} — try adding them to your roadmap.`);
    }
    case 'self_declared': {
      const answer = declarations?.[rule.key];
      if (answer === true) return result(rule, 'met', null, 'You confirmed this criterion. SarthiAI cannot verify it for you.');
      if (answer === false) return result(rule, 'unmet', null, 'You indicated you do not meet this criterion.');
      // "Who is this scheme for" rules: compare with the student's private details when they shared them.
      if (rule.restrictsAudience || rule.key === 'target_group' || rule.key === 'audience') {
        const a = evaluateAudience(`${rule.label} ${rule.sourceExcerpt ?? ''}`, p);
        if (a) return audienceResult(rule, a);
      }
      return result(rule, 'unknown', null, rule.note ?? 'SarthiAI cannot verify this from your profile.',
        'Read this criterion on the official source and confirm it yourself.');
    }
    case 'gender_in':
      return privateChoice(rule, p.gender, values, 'gender');
    case 'category_in':
      return privateChoice(rule, p.socialCategory, values, 'category');
    case 'parent_service_in':
      return privateChoice(rule, p.parentService, values, 'parent or guardian’s service');
    case 'disability_required':
      return privateFlag(rule, p.disability, 'a disability (PwD)');
    case 'minority_required':
      return privateFlag(rule, p.minority, 'minority status');
    case 'first_generation_required':
      return privateFlag(rule, p.firstGeneration, 'first-generation learner status');
    default:
      return result(rule, 'unknown', null, 'This criterion type is not supported for automatic checking.');
  }
}

const ADD_PRIVATELY = 'Add it privately in Profile ▸ Edit profile ▸ Preferences (never shared with the AI or your college), or check the official source.';

/** Private details are compared, never echoed: explanations don't repeat the student's answer. */
function privateChoice(rule, value, accepted, what) {
  if (value == null) return result(rule, 'unknown', null, `This depends on your ${what}, which you haven't added (optional, private).`, ADD_PRIVATELY);
  const ok = accepted.map((v) => String(v).toLowerCase()).includes(String(value).toLowerCase());
  return ok
    ? result(rule, 'met', null, 'Matches the private details in your profile.')
    : result(rule, 'unmet', null, 'This scheme is for a different group, according to the private details in your profile.', 'If your private details are out of date, update them in Profile.');
}

function privateFlag(rule, value, what) {
  if (value == null) return result(rule, 'unknown', null, `This depends on ${what}, which you haven't added (optional, private).`, ADD_PRIVATELY);
  return value === true
    ? result(rule, 'met', null, 'Matches the private details in your profile.')
    : result(rule, 'unmet', null, 'This scheme is for a different group, according to the private details in your profile.', 'If your private details are out of date, update them in Profile.');
}

function audienceResult(rule, a) {
  const opts = { isPrivate: true };
  if (a.status === 'met') return result(rule, 'met', null, `This scheme is for ${a.labels.join(' / ')}; that matches the private details in your profile.`, null, opts);
  if (a.status === 'unmet') return result(rule, 'unmet', null, `This scheme is for ${a.labels.join(' / ')}; your private details say this doesn't apply to you.`, 'If your private details are out of date, update them in Profile.', opts);
  if (a.extraCondition) return result(rule, 'unknown', null, `Your private details match the group (${a.labels.join(' / ')}), but the scheme has an extra condition SarthiAI can't check.`, 'Read the scheme name and guidelines and confirm it yourself.', opts);
  if (a.missingField) {
    const field = { gender: 'gender', socialCategory: 'category', disability: 'disability status', minority: 'minority status', parentService: 'parent or guardian’s service', firstGeneration: 'first-generation status' }[a.missingField];
    return result(rule, 'unknown', null, `This scheme is for ${a.labels.join(' / ')}. It depends on your ${field}, which you haven't added (optional, private).`, ADD_PRIVATELY, opts);
  }
  return result(rule, 'unknown', null, `This scheme is for ${a.labels.join(' / ')} or another group SarthiAI can't check.`, 'Read the scheme name and guidelines and confirm it yourself.', opts);
}

/**
 * What the AI may see of an eligibility result: private criteria lose their
 * status and explanation, and the overall result is recomputed without them.
 */
export function eligibilityForModel(r) {
  const open = r.criteria.filter((c) => !c.private);
  const mandatory = open.filter((c) => c.mandatory);
  const overall = r.overall === OVERALL.INSUFFICIENT_SOURCE ? r.overall
    : mandatory.some((c) => c.status === 'unmet') ? OVERALL.LIKELY_INELIGIBLE
      : mandatory.some((c) => c.status === 'unknown') ? OVERALL.MISSING_INFO : OVERALL.ALL_MET;
  return {
    overall,
    criteria: r.criteria.map((c) => (c.private
      ? { requirement: c.requirement, status: 'checked_privately', mandatory: c.mandatory, explanation: 'Uses details the student keeps private from Sarthi. The app shows the student this result directly.', nextStep: null }
      : { requirement: c.requirement, status: c.status, mandatory: c.mandatory, explanation: c.explanation, nextStep: c.nextStep })),
    privateCriteria: r.criteria.filter((c) => c.private).length,
  };
}

/** Rules derived from top-level structured fields when no explicit rule covers them. */
function derivedRules(opp) {
  const explicit = new Set((opp.eligibilityRules ?? []).map((r) => r.kind));
  const rules = [];
  if (opp.eligibleDegrees?.length && !explicit.has('degree_in')) {
    rules.push({ key: 'degree', kind: 'degree_in', label: `Degree: ${opp.eligibleDegrees.join(', ')}`, mandatory: true, values: opp.eligibleDegrees });
  }
  if (opp.eligibleYears?.length && !explicit.has('year_in')) {
    rules.push({ key: 'year', kind: 'year_in', label: `Year of study: ${opp.eligibleYears.join(', ')}`, mandatory: true, values: opp.eligibleYears.map(String) });
  }
  if (opp.eligibleBranches?.length && !explicit.has('branch_in')) {
    rules.push({ key: 'branch', kind: 'branch_in', label: `Branch: ${opp.eligibleBranches.join(', ')}`, mandatory: true, values: opp.eligibleBranches });
  }
  if (opp.minimumCGPA != null && !explicit.has('min_cgpa')) {
    rules.push({ key: 'cgpa', kind: 'min_cgpa', label: `Minimum CGPA ${opp.minimumCGPA}`, mandatory: true, numberValue: opp.minimumCGPA });
  }
  if (opp.requiredSkills?.length && !explicit.has('skills_all') && !explicit.has('skills_any')) {
    rules.push({ key: 'skills', kind: 'skills_all', label: `Skills: ${opp.requiredSkills.join(', ')}`, mandatory: false, values: opp.requiredSkills });
  }
  return rules;
}

export { GROUPS };

export const OVERALL = {
  ALL_MET: 'all_criteria_met',
  MISSING_INFO: 'missing_information',
  LIKELY_INELIGIBLE: 'likely_ineligible',
  INSUFFICIENT_SOURCE: 'insufficient_source_info',
};

export function checkEligibility(opportunity, profile, { declarations = {}, now = new Date() } = {}) {
  const rules = [...(opportunity.eligibilityRules ?? []), ...derivedRules(opportunity)];
  const criteria = rules.map((r) => evaluateRule(r, profile, declarations, now));

  const mandatory = criteria.filter((c) => c.mandatory);
  const counts = {
    met: criteria.filter((c) => c.status === 'met').length,
    unmet: criteria.filter((c) => c.status === 'unmet').length,
    unknown: criteria.filter((c) => c.status === 'unknown').length,
  };

  let overall;
  if (criteria.length === 0 || opportunity.verificationStatus === 'unverified') {
    overall = OVERALL.INSUFFICIENT_SOURCE;
  } else if (mandatory.some((c) => c.status === 'unmet')) {
    overall = OVERALL.LIKELY_INELIGIBLE;
  } else if (mandatory.some((c) => c.status === 'unknown')) {
    overall = OVERALL.MISSING_INFO;
  } else {
    overall = OVERALL.ALL_MET;
  }

  const caveats = [];
  const availability = computeAvailability(opportunity, now);
  if (availability === 'closed') caveats.push({ code: 'closed', message: 'Applications appear to be closed for this cycle.' });
  if (!opportunity.deadline) caveats.push({ code: 'deadline_unknown', message: 'The official source does not state a deadline SarthiAI could verify.' });
  if (opportunity.verificationStatus !== 'verified') caveats.push({ code: 'source_unverified', message: 'This listing has not been verified against its official source yet.' });
  else if (isStale(opportunity, now)) caveats.push({ code: 'source_stale', message: 'This listing was last verified over 30 days ago. Details may have changed.' });

  return {
    opportunityId: String(opportunity._id ?? opportunity.id ?? ''),
    overall,
    counts,
    criteria,
    caveats,
    availability,
    disclaimer: 'This is a guidance check based on your SarthiAI profile and the published criteria. It is not an official eligibility decision. Always confirm on the official source.',
    checkedAt: now.toISOString(),
  };
}

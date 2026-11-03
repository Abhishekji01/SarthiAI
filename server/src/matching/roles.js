/**
 * Role families: what kind of job a listing is, and what kind the student wants.
 *
 * A listing's family comes from its `role-<family>` tag (set by the scraper) or,
 * for other listings, from its title. A student's target families come from their
 * career goal, headline and interests. This stops e.g. a UI/UX Designer job ranking
 * first for a student whose goal is "machine learning engineer" just because the
 * posting mentions ML somewhere.
 */

export const FAMILY_LABEL = {
  'ml-ai': 'ML/AI', data: 'data', security: 'security', hardware: 'hardware/embedded', 'devops-cloud': 'cloud/DevOps',
  qa: 'QA/testing', mobile: 'mobile app', design: 'design', frontend: 'frontend', support: 'support/solutions',
  writing: 'technical writing', product: 'product', software: 'software engineering',
};

// Same order and patterns as ingest/ats_jobs.py ROLE_FAMILIES (first match wins).
const LISTING_FAMILIES = [
  ['ml-ai', /machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|computer vision|data scien|\bllms?\b|gen ?ai|applied scientist|research (?:engineer|scientist)/i],
  ['hardware', /embedded|firmware|hardware|vlsi|asic|fpga|silicon|robotics|electronics|electrical|\bic\b|analog|mixed-signal|semiconductor/i],
  ['data', /\bdata\b(?! cent(?:er|re))|analytics|business intelligence|\bbi\b/i],
  ['security', /security|cyber|\bsoc\b|penetration/i],
  ['devops-cloud', /devops|\bsre\b|site reliability|cloud|infrastructure|platform engineer/i],
  ['qa', /\bqa\b|quality|\btest/i],
  ['mobile', /android|\bios\b|mobile|flutter|react native/i],
  ['design', /\bux\b|\bui\/ux\b|\bui\b(?! engineer)|designer|design intern|product design/i],
  ['frontend', /front[- ]?end|\bui engineer/i],
  ['support', /support|customer|solutions? engineer|implementation|deployment|technical account|consultant|operations/i],
  ['writing', /writer|documentation|technical publication/i],
  ['product', /product (?:manager|analyst|management)|program manager/i],
  ['software', /software|\bsde\b|\bswe\b|developer|back[- ]?end|full[- ]?stack|engineer|programmer/i],
];

/** What a student is aiming for (all matches, not just the first). */
const TARGET_PATTERNS = [
  ['ml-ai', /machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|computer vision|data scien|\bllm|gen ?ai/i],
  ['data', /\bdata\b|analytics|business intelligence|\bbi\b/i],
  ['security', /security|cyber|ethical hack|penetration|\bsoc\b|forensic/i],
  ['hardware', /embedded|firmware|hardware|vlsi|chip|fpga|robotics|electronics|iot|semiconductor/i],
  ['devops-cloud', /devops|\bsre\b|cloud|infrastructure/i],
  ['qa', /\bqa\b|testing|test engineer|quality assurance/i],
  ['mobile', /android|\bios\b|mobile|app develop|flutter/i],
  ['design', /\bux\b|\bui\b|design(?:er)?\b/i],
  ['frontend', /front[- ]?end|web develop|full[- ]?stack|react/i],
  ['product', /product manag|program manag/i],
  ['writing', /technical writ|documentation/i],
  ['software', /software|\bsde\b|\bswe\b|developer|programmer|back[- ]?end|full[- ]?stack|web develop|coding|open source/i],
];

/** Families close enough that one is a reasonable step towards the other. */
const RELATED = {
  'ml-ai': ['data', 'software'], data: ['ml-ai', 'software'], software: ['frontend', 'mobile', 'devops-cloud', 'ml-ai', 'qa'],
  frontend: ['software', 'mobile', 'design'], mobile: ['software', 'frontend'], 'devops-cloud': ['software', 'security'],
  security: ['devops-cloud', 'software'], qa: ['software'], hardware: ['software'], design: ['frontend', 'product'],
  product: ['design', 'data'], support: ['software'], writing: [],
};

export function listingFamily(opp) {
  const tag = (opp.tags ?? []).find((t) => String(t).startsWith('role-'));
  if (tag) return tag.slice(5);
  if (!['job', 'internship'].includes(opp.opportunityType)) return null;
  for (const [fam, rx] of LISTING_FAMILIES) if (rx.test(opp.title ?? '')) return fam;
  return null;
}

export function studentTargets(profile) {
  const p = profile ?? {};
  const text = [p.careerGoal, p.headline, ...(p.interests ?? [])].filter(Boolean).join(' · ');
  if (!text) return [];
  return TARGET_PATTERNS.filter(([, rx]) => rx.test(text)).map(([fam]) => fam);
}

/** 'match' | 'related' | 'mismatch' | null (cannot tell). */
export function roleFit(opp, profile) {
  const fam = listingFamily(opp);
  const targets = studentTargets(profile);
  if (!fam || !targets.length) return { fit: null, family: fam, targets };
  if (targets.includes(fam)) return { fit: 'match', family: fam, targets };
  if (targets.some((t) => (RELATED[t] ?? []).includes(fam))) return { fit: 'related', family: fam, targets };
  return { fit: 'mismatch', family: fam, targets };
}

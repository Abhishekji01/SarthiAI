/**
 * Who a scheme is for, read deterministically from its own wording (rule label /
 * scheme name), so existing listings can be checked against the student's
 * private details without re-scraping. Each group maps to one private field.
 * The student's details are only compared, never inferred.
 */
export const GROUPS = {
  women: { field: 'gender', rx: /\b(girls?|women'?s?|woman|female|kanya)\b/i, test: (p) => (p.gender == null ? null : p.gender === 'female'), label: 'girl / women students' },
  disability: { field: 'disability', rx: /specially[- ]?abled|disabilit|divyang|\bpwd\b|handicap/i, test: (p) => (p.disability == null ? null : p.disability === true), label: 'students with a disability' },
  sc: { field: 'socialCategory', rx: /\b(SCs?|Scs)\b|[Ss]cheduled [Cc]astes?/, test: (p) => (p.socialCategory == null ? null : p.socialCategory === 'sc'), label: 'SC students' },
  st: { field: 'socialCategory', rx: /\bSTs?\b|[Ss]cheduled [Tt]ribes?/, test: (p) => (p.socialCategory == null ? null : p.socialCategory === 'st'), label: 'ST students' },
  obc: { field: 'socialCategory', rx: /\bOBCs?\b|other backward class/i, test: (p) => (p.socialCategory == null ? null : p.socialCategory === 'obc'), label: 'OBC students' },
  ews: { field: 'socialCategory', rx: /\bEWS\b|economically weaker section/i, test: (p) => (p.socialCategory == null ? null : p.socialCategory === 'ews'), label: 'EWS students' },
  minority: { field: 'minority', rx: /\bminorit(y|ies)\b/i, test: (p) => (p.minority == null ? null : p.minority === true), label: 'minority-community students' },
  firstGeneration: { field: 'firstGeneration', rx: /first[- ]generation/i, test: (p) => (p.firstGeneration == null ? null : p.firstGeneration === true), label: 'first-generation learners' },
  capf: { field: 'parentService', rx: /central armed police|\bcapf\b|assam rifles/i, test: (p) => (p.parentService == null ? null : p.parentService === 'capf'), label: 'wards of CAPF / Assam Rifles personnel' },
  railways: { field: 'parentService', rx: /ministry of railways|railway protection|\brpf\b|\brpsf\b/i, test: (p) => (p.parentService == null ? null : p.parentService === 'railways'), label: 'wards of Railways personnel' },
  defence: { field: 'parentService', rx: /ex-?servicem[ae]n|defence personnel|(army|navy|air force) personnel/i, test: (p) => (p.parentService == null ? null : p.parentService === 'defence'), label: 'wards of defence personnel' },
  statePolice: { field: 'parentService', rx: /(state|ut)s?\/?(uts)? police|police personnel/i, test: (p) => (p.parentService == null ? null : p.parentService === 'state_police'), label: 'wards of state / UT police personnel' },
};

const PARENT = new Set(['capf', 'railways', 'defence', 'statePolice']);
/** Wording that names a group SarthiAI has no field for: a match can still be confirmed, a mismatch can't. */
const OTHER_GROUPS = /beneficiar|orphan|swanath|\bner\b|north[- ]?east|jammu|kashmir|ladakh|beedi|cine|\bebc\b|\bdnt\b|denotified|statistical institute/i;
/** Extra conditions on top of the group (e.g. "martyred"): a match still needs the student to confirm. */
const EXTRA_CONDITION = /martyr|killed|died|disabled in|deceased/i;

/** Groups named in a piece of scheme text. CAPF wording also says "police", so it wins over state police. */
export function groupsIn(text) {
  const t = String(text ?? '');
  const found = Object.entries(GROUPS).filter(([, g]) => g.rx.test(t)).map(([k]) => k);
  return found.includes('capf') ? found.filter((k) => k !== 'statePolice') : found;
}

/**
 * Evaluates an audience criterion against private details.
 * Returns null when the text names no known group (stays a self-declared check),
 * else { status: 'met' | 'unmet' | 'unknown', groups, missingField }.
 */
export function evaluateAudience(text, profile = {}) {
  const groups = groupsIn(text);
  if (!groups.length) return null;
  const results = groups.map((k) => GROUPS[k].test(profile));
  const labels = groups.map((k) => GROUPS[k].label);
  if (results.some((r) => r === true)) {
    return { status: EXTRA_CONDITION.test(text) ? 'unknown' : 'met', groups, labels, extraCondition: EXTRA_CONDITION.test(text) };
  }
  if (results.some((r) => r === null)) return { status: 'unknown', groups, labels, missingField: GROUPS[groups[results.indexOf(null)]].field };
  // Every named group answered "no". Only conclusive when the text names no other group we can't check.
  const parentOnly = groups.every((k) => PARENT.has(k));
  return { status: parentOnly || !OTHER_GROUPS.test(text) ? 'unmet' : 'unknown', groups, labels };
}

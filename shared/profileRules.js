/**
 * Profile limits and rules shared by the API (zod schemas) and the web/Android
 * forms, so a value the form accepts is never rejected later by the server.
 * Plain ES module with no dependencies.
 */

export const LIMITS = Object.freeze({
  cgpaMin: 0,
  cgpaMax: 10,
  cgpaDecimals: 2,
  tagMaxLength: 40,
  tagMaxItems: 30,
  incomeMax: 1_000_000_000,
  careerGoalMax: 300,
  nameMax: 100,
});

/** Typical programme length in years, by normalised degree. */
export const DEGREE_YEARS = Object.freeze({ btech: 4, be: 4, barch: 5, mbbs: 5, bds: 5, llb: 5, bpharm: 4, bdes: 4, integrated: 5, bsc: 3, bs: 4, bca: 3, bcom: 3, ba: 3, bba: 3, mtech: 2, me: 2, msc: 2, ms: 2, mca: 2, mba: 2, ma: 2, mcom: 2, diploma: 3, phd: 6 });
export const MAX_PROGRAMME_YEARS = 6;

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const DEGREE_KEYS = { bachelorofengineering: 'be', bacheloroftechnology: 'btech', bachelorofscience: 'bsc', bachelorofcomputerapplications: 'bca', masteroftechnology: 'mtech', masterofcomputerapplications: 'mca', pgdm: 'mba', bpharma: 'bpharm', polytechnic: 'diploma', dualdegree: 'integrated', doctorate: 'phd' };
export const degreeKey = (d) => DEGREE_KEYS[squash(d)] ?? squash(d);

/** Indian academic years run July–June; returns the calendar year the current one ends in. */
export function academicYearEnd(now = new Date()) {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

/**
 * Graduation years that fit a student's current year of study. A student in
 * year Y of an L-year programme graduates when this academic year ends plus
 * (L - Y) years; one extra year is allowed for a gap or backlog.
 */
export function graduationYearRange(degree, currentYear, now = new Date()) {
  const end = academicYearEnd(now);
  const known = DEGREE_YEARS[degreeKey(degree)];
  const len = known ?? MAX_PROGRAMME_YEARS;
  const y = Number(currentYear);
  if (!y) return { min: end, max: end + len };
  const remaining = Math.max(0, len - y);
  // Without a known programme length, only the upper bound can be checked.
  return { min: known ? end + Math.max(0, remaining - 1) : end, max: end + remaining + 1 };
}

/** Returns an error message, or null. Each takes the raw text a student typed. */
export function cgpaError(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  if (!/^\d+(\.\d+)?$/.test(v)) return 'Enter your CGPA as a number, e.g. 8.25';
  const n = Number(v);
  if (n < LIMITS.cgpaMin || n > LIMITS.cgpaMax) return `CGPA must be between ${LIMITS.cgpaMin} and ${LIMITS.cgpaMax}`;
  if ((v.split('.')[1] ?? '').length > LIMITS.cgpaDecimals) return `Use at most ${LIMITS.cgpaDecimals} decimal places`;
  return null;
}

export function cgpaNumberError(n) {
  if (n == null) return null;
  if (!Number.isFinite(n) || n < LIMITS.cgpaMin || n > LIMITS.cgpaMax) return `CGPA must be between ${LIMITS.cgpaMin} and ${LIMITS.cgpaMax}`;
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return `Use at most ${LIMITS.cgpaDecimals} decimal places`;
  return null;
}

/** Commas and spaces are allowed as digit grouping ("3,50,000"); anything else is an error. */
export const incomeDigits = (raw) => String(raw ?? '').replace(/[\s,]/g, '');
export function incomeError(raw) {
  const v = incomeDigits(raw);
  if (!v) return null;
  if (v.startsWith('-')) return 'Income cannot be negative';
  if (!/^\d+$/.test(v)) return 'Enter a whole number of rupees, e.g. 350000';
  if (Number(v) > LIMITS.incomeMax) return 'That amount looks too large';
  return null;
}

export function graduationYearError(gradYear, degree, currentYear, now = new Date()) {
  if (!gradYear || !currentYear) return null;
  const { min, max } = graduationYearRange(degree, currentYear, now);
  const g = Number(gradYear);
  if (g < min || g > max) {
    return min === max
      ? `A year-${currentYear} student graduates in ${min}. Check your year of study or graduation year.`
      : `A year-${currentYear} student graduates between ${min} and ${max}. Check your year of study or graduation year.`;
  }
  return null;
}

export function tagListError(list, label) {
  if ((list ?? []).length > LIMITS.tagMaxItems) return `Add at most ${LIMITS.tagMaxItems} ${label}`;
  const long = (list ?? []).find((t) => String(t).length > LIMITS.tagMaxLength);
  if (long) return `"${String(long).slice(0, 20)}…" is too long — keep each one under ${LIMITS.tagMaxLength} characters`;
  return null;
}

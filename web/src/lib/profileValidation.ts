import { cgpaError, graduationYearError, incomeError, LIMITS, tagListError } from '../../../shared/profileRules.js';
import type { Draft } from '../components/ProfileForm';

/** Form fields that can carry an inline error. */
export type FieldKey = 'college' | 'degree' | 'branch' | 'currentYear' | 'graduationYear' | 'cgpa' | 'skills' | 'interests' | 'careerGoal' | 'homeState' | 'income' | 'name';
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** Onboarding step (0-based) that holds each field. */
export const FIELD_STEP: Record<FieldKey, number> = {
  college: 0, name: 0,
  degree: 1, branch: 1, currentYear: 1, graduationYear: 1, cgpa: 1,
  skills: 2, interests: 2, careerGoal: 2,
  homeState: 3, income: 3,
};

/** DOM id of each field's control, so it can be focused. */
export const fieldId = (k: FieldKey) => `field-${k}`;

/** Step 2 (education). Degree and year of study are required during onboarding. */
export function validateEducation(d: Draft, { requireCore = false, now = new Date() } = {}): FieldErrors {
  const e: FieldErrors = {};
  if (requireCore && !d.degree) e.degree = 'Choose your degree';
  if (requireCore && !d.currentYear) e.currentYear = 'Choose your current year of study';
  const c = cgpaError(d.cgpa);
  if (c) e.cgpa = c;
  const g = graduationYearError(d.graduationYear, d.degree, d.currentYear, now);
  if (g) e.graduationYear = g;
  return e;
}

export function validateInterests(d: Draft): FieldErrors {
  const e: FieldErrors = {};
  const s = tagListError(d.skills, 'skills');
  if (s) e.skills = s;
  const i = tagListError(d.interests, 'interests');
  if (i) e.interests = i;
  if (d.careerGoal.length > LIMITS.careerGoalMax) e.careerGoal = `Keep it under ${LIMITS.careerGoalMax} characters`;
  return e;
}

export function validatePreferences(d: Draft): FieldErrors {
  const e: FieldErrors = {};
  const i = incomeError(d.income);
  if (i) e.income = i;
  return e;
}

export function validateStep(step: number, d: Draft, opts: { requireCore?: boolean; now?: Date } = {}): FieldErrors {
  if (step === 1) return validateEducation(d, opts);
  if (step === 2) return validateInterests(d);
  if (step === 3) return validatePreferences(d);
  return {};
}

export const validateAll = (d: Draft, opts: { requireCore?: boolean; now?: Date } = {}): FieldErrors =>
  ({ ...validateEducation(d, opts), ...validateInterests(d), ...validatePreferences(d) });

const SERVER_FIELD: Record<string, FieldKey> = {
  'profile.collegeId': 'college', 'profile.customCollegeName': 'college', name: 'name',
  'profile.degree': 'degree', 'profile.branch': 'branch', 'profile.currentYear': 'currentYear', 'profile.graduationYear': 'graduationYear', 'profile.cgpa': 'cgpa',
  'profile.skills': 'skills', 'profile.interests': 'interests', 'profile.careerGoal': 'careerGoal',
  'profile.homeState': 'homeState', 'profile.annualFamilyIncomeINR': 'income',
};

/** Maps API error details ({ field: 'profile.cgpa' } or 'profile.skills.3') to form fields. */
export function fieldErrorsFromServer(details: unknown): FieldErrors {
  const out: FieldErrors = {};
  if (!Array.isArray(details)) return out;
  for (const d of details as { field?: string; message?: string }[]) {
    const path = String(d.field ?? '').replace(/\.\d+.*$/, '');
    const key = SERVER_FIELD[path];
    if (key && !out[key]) out[key] = d.message ?? 'Check this field';
  }
  return out;
}

/** The first field with an error, in form order. */
export function firstErrorField(e: FieldErrors): FieldKey | null {
  const order = Object.keys(FIELD_STEP) as FieldKey[];
  return order.sort((a, b) => FIELD_STEP[a] - FIELD_STEP[b]).find((k) => e[k]) ?? null;
}

/** Focuses a field's control and scrolls it clear of the sticky footer. */
export function focusField(k: FieldKey) {
  requestAnimationFrame(() => {
    const el = document.getElementById(fieldId(k));
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });
}

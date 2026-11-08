import { describe, expect, it } from 'vitest';
import { fieldErrorsFromServer, firstErrorField, FIELD_STEP, validateEducation, validatePreferences, validateInterests } from './profileValidation';
import type { Draft } from '../components/ProfileForm';

const NOW = new Date('2026-11-07T10:00:00Z'); // academic year 2026-27
const draft = (p: Partial<Draft> = {}): Draft => ({
  name: 'Isha', college: null, customCollege: '', degree: 'B.Tech', branch: '', currentYear: '2', graduationYear: '', cgpa: '',
  skills: [], interests: [], careerGoal: '', headline: '', workModes: [], locations: [], homeState: '', income: '',
  projects: [], experience: [], achievements: [], github: '', linkedin: '', portfolio: '',
  gender: '', socialCategory: '', disability: '', minority: '', parentService: '', firstGeneration: '', ...p,
});

describe('H3: onboarding step rules', () => {
  it('rejects CGPA outside 0–10 or with more than 2 decimals', () => {
    expect(validateEducation(draft({ cgpa: '15' })).cgpa).toMatch(/between 0 and 10/);
    expect(validateEducation(draft({ cgpa: '8.255' })).cgpa).toMatch(/2 decimal/);
    expect(validateEducation(draft({ cgpa: 'abc' })).cgpa).toMatch(/number/);
    expect(validateEducation(draft({ cgpa: '-1' })).cgpa).toBeTruthy();
    expect(validateEducation(draft({ cgpa: '8.25' })).cgpa).toBeUndefined();
    expect(validateEducation(draft({ cgpa: '' })).cgpa).toBeUndefined();
  });
  it('checks the graduation year against the year of study', () => {
    expect(validateEducation(draft({ currentYear: '4', graduationYear: '2033' }), { now: NOW }).graduationYear).toMatch(/year-4 student graduates/);
    expect(validateEducation(draft({ currentYear: '4', graduationYear: '2027' }), { now: NOW }).graduationYear).toBeUndefined();
    expect(validateEducation(draft({ currentYear: '1', graduationYear: '2030' }), { now: NOW }).graduationYear).toBeUndefined();
    expect(validateEducation(draft({ currentYear: '1', graduationYear: '2027' }), { now: NOW }).graduationYear).toBeTruthy();
  });
  it('requires degree and year of study only when asked (onboarding)', () => {
    const blank = draft({ degree: '', currentYear: '' });
    expect(validateEducation(blank)).toEqual({});
    expect(Object.keys(validateEducation(blank, { requireCore: true }))).toEqual(['degree', 'currentYear']);
  });
  it('shows an error for a negative or fractional income instead of silently fixing it', () => {
    expect(validatePreferences(draft({ income: '-50000' })).income).toMatch(/negative/);
    expect(validatePreferences(draft({ income: '2.5 lakh' })).income).toMatch(/whole number/);
    expect(validatePreferences(draft({ income: '3,50,000' })).income).toBeUndefined();
  });
  it('limits skills and interests to 30 items of 40 characters', () => {
    expect(validateInterests(draft({ skills: Array.from({ length: 31 }, (_, i) => `s${i}`) })).skills).toMatch(/at most 30/);
    expect(validateInterests(draft({ interests: ['x'.repeat(41)] })).interests).toMatch(/40 characters/);
  });
  it('maps server field errors back to the right field and step', () => {
    const e = fieldErrorsFromServer([{ field: 'profile.cgpa', message: 'CGPA must be between 0 and 10' }, { field: 'profile.skills.3', message: 'too long' }]);
    expect(e).toEqual({ cgpa: 'CGPA must be between 0 and 10', skills: 'too long' });
    expect(firstErrorField(e)).toBe('cgpa');
    expect(FIELD_STEP.cgpa).toBe(1);
    expect(fieldErrorsFromServer([{ field: 'profile.annualFamilyIncomeINR', message: 'x' }])).toEqual({ income: 'x' });
  });
});

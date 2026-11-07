import { describe, expect, it } from 'vitest';
import { daysUntil, formatMoney } from './format';

describe('format helpers', () => {
  it('counts calendar days in IST', () => {
    expect(daysUntil('2026-11-30T18:29:00Z', new Date('2026-11-29T18:31:00Z'))).toBe(0);
  });
  it('formats rupee amounts with Indian grouping', () => {
    expect(formatMoney({ amount: 125000, currency: 'INR', period: 'per_year' } as never)).toBe('₹1,25,000/year');
  });
});

import { clipAtWord, personInitials, tidyEnding } from './format';

describe('L5: display helpers', () => {
  it('avatar initials use letters only, the same everywhere', () => {
    expect(personInitials('Isha Sharma')).toBe('IS');
    expect(personInitials('isha')).toBe('I');
    expect(personInitials('Isha Rani Sharma')).toBe('IS');
    expect(personInitials('राहुल कुमार')).toBe('रक');
    expect(personInitials('<')).toBeNull();
    expect(personInitials('  ')).toBeNull();
  });
  it('clips at a word boundary with an ellipsis', () => {
    expect(clipAtWord('Competitive stipend and stay provided for students', 28)).toBe('Competitive stipend and…');
    expect(clipAtWord('Short text', 28)).toBe('Short text');
  });
  it('tidies stored text that was cut mid-word', () => {
    const cut = `${'word '.repeat(700)}Competitive stipend and sta`;
    expect(tidyEnding(cut)).toMatch(/Competitive stipend and…$/);
    expect(tidyEnding('A complete sentence.')).toBe('A complete sentence.');
  });
});

import { googleCalendarUrl } from './format';

describe('F5: Add to Google Calendar link', () => {
  it('is an all-day event on the India date, matching the server .ics', () => {
    const u = new URL(googleCalendarUrl({ title: 'Pragati', organization: 'AICTE', sourceUrl: 'https://aicte.gov.in', deadline: '2026-11-30T18:29:00Z' })!);
    expect(u.origin).toBe('https://calendar.google.com');
    expect(u.searchParams.get('dates')).toBe('20261130/20261201');
    expect(u.searchParams.get('text')).toBe('Deadline: Pragati');
    expect(googleCalendarUrl({ title: 'x', organization: 'y', sourceUrl: 'z', deadline: null })).toBeNull();
  });
});

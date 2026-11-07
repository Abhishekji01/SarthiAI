import { describe, expect, it } from 'vitest';
import { safeNext, welcomeWithNext } from './next';

describe('F1: return to the page after signing in', () => {
  it('accepts in-app paths only', () => {
    expect(safeNext('/opportunity/65a1b2c3d4e5f6a7b8c9d0e1')).toBe('/opportunity/65a1b2c3d4e5f6a7b8c9d0e1');
    expect(safeNext(encodeURIComponent('/discover?type=scholarship'))).toBe('/discover?type=scholarship');
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '/welcome', '/onboarding?next=/x', '', null]) expect(safeNext(bad), String(bad)).toBeNull();
  });
  it('builds the welcome link', () => {
    expect(welcomeWithNext('/discover?type=hackathon')).toBe('/welcome?next=%2Fdiscover%3Ftype%3Dhackathon');
    expect(welcomeWithNext('/')).toBe('/welcome');
  });
});

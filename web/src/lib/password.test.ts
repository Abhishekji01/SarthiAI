import { describe, expect, it } from 'vitest';
import { passwordProblems, passwordStrength } from './password';

describe('F2: password rules and strength hint', () => {
  it('mirrors the server rules', () => {
    expect(passwordProblems('short')).toEqual(['At least 8 characters (5/8).']);
    expect(passwordProblems('        ')).toEqual(['Cannot be only spaces.']);
    expect(passwordProblems('Password123')).toEqual(['This password is too common.']);
    expect(passwordProblems('monsoon river kite')).toEqual([]);
  });
  it('rates strength', () => {
    expect(passwordStrength('abcdefgh')).toBe('weak');
    expect(passwordStrength('abcdefgh12')).toBe('fair');
    expect(passwordStrength('Kite-River-9')).toBe('strong');
    expect(passwordStrength('monsoon river kite')).toBe('strong');
  });
});

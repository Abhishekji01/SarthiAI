import { describe, expect, it } from 'vitest';
import { tileNote } from './Home';

describe('H4: Home tile note', () => {
  it('says "Nothing open" only when nothing is open', () => {
    expect(tileNote({ open: 0, likelyEligible: 0, needDetails: 0, likelyIneligible: 0, closingIn30Days: 0 })).toBe('Nothing open right now');
    expect(tileNote({ open: 32, likelyEligible: 0, needDetails: 0, likelyIneligible: 0, closingIn30Days: 0 })).toBe('Open now');
  });
  it('shows the eligibility split for open listings', () => {
    expect(tileNote({ open: 32, likelyEligible: 1, needDetails: 23, likelyIneligible: 8, closingIn30Days: 23 })).toBe('1 fit you · 23 need your details');
    expect(tileNote({ open: 4, likelyEligible: 0, needDetails: 0, likelyIneligible: 4, closingIn30Days: 2 })).toBe('2 close within 30 days');
  });
});

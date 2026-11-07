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

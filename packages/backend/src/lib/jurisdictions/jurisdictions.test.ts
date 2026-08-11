import { describe, expect, test } from 'bun:test';
import { resolveRule } from '@quro/shared';
import { nlJurisdiction } from './nl';

describe('effective-dated jurisdiction rules', () => {
  test('resolves the 2025 and both 2026 bands', () => {
    expect(resolveRule(nlJurisdiction.safeWithdrawalRate, '2025-06-01')).toEqual({
      value: 0.0282,
      effectiveFrom: '2025-01-01',
      effectiveTo: '2025-12-31',
      isExtrapolated: false,
      source: null,
    });
    expect(
      resolveRule(nlJurisdiction.unemploymentBenefit!, '2026-06-30').value.maximumDailyWage,
    ).toBe(304.25);
    expect(
      resolveRule(nlJurisdiction.unemploymentBenefit!, '2026-07-01').value.maximumDailyWage,
    ).toBe(309.91);
  });

  test('carries the last published rule forward explicitly', () => {
    const resolution = resolveRule(nlJurisdiction.unemploymentBenefit!, '2027-03-01');
    expect(resolution.value.maximumDailyWage).toBe(309.91);
    expect(resolution.effectiveFrom).toBe('2026-07-01');
    expect(resolution.isExtrapolated).toBe(true);
  });

  test('marks dates before the first published band as extrapolated', () => {
    expect(resolveRule(nlJurisdiction.unemploymentBenefit!, '2025-12-31').isExtrapolated).toBe(
      true,
    );
  });
});

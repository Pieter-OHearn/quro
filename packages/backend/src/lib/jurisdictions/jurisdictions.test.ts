import { describe, expect, test } from 'bun:test';
import {
  JURISDICTION_CODES,
  resolveRule,
  ruleReviewExpiresOn,
  type DatedRule,
  type NonEmptyDatedRules,
} from '@quro/shared';
import { auJurisdiction } from './au';
import { getJurisdictionProfile } from './index';
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

  test('ships dedicated Australian Fair Work rules', () => {
    expect(resolveRule(auJurisdiction.severance!, '2026-08-11').value.model).toBe('service_weeks');
    expect(auJurisdiction.unemploymentBenefit).toBeNull();
  });
});

describe('stale rules never silently become current', () => {
  const STATUTORY_RULES = ['unemploymentBenefit', 'severance', 'wealthTax'] as const;
  const allRules = JURISDICTION_CODES.flatMap((code) => {
    const profile = getJurisdictionProfile(code);
    return [
      ...STATUTORY_RULES.map((name) => ({ code, name, rules: profile[name], statutory: true })),
      { code, name: 'safeWithdrawalRate', rules: profile.safeWithdrawalRate, statutory: false },
      {
        code,
        name: 'defaultEffectiveTaxRate',
        rules: profile.defaultEffectiveTaxRate,
        statutory: false,
      },
    ];
  }).filter(
    (entry): entry is typeof entry & { rules: NonEmptyDatedRules<unknown> } => entry.rules !== null,
  );

  test('an open-ended sourced rule is current until twelve months after its review', () => {
    const severance = auJurisdiction.severance!;
    expect(severance[0].effectiveTo).toBeNull();
    expect(ruleReviewExpiresOn('2026-08-11')).toBe('2027-08-11');
    expect(resolveRule(severance, '2027-08-11').isExtrapolated).toBe(false);
    expect(resolveRule(severance, '2027-08-12').isExtrapolated).toBe(true);
    expect(resolveRule(severance, '2027-08-12').value.model).toBe('service_weeks');
    expect(ruleReviewExpiresOn('2028-02-29')).toBe('2029-03-01');
  });

  test('every statutory rule either ends or carries a review date, so it can go stale', () => {
    for (const { code, name, rules, statutory } of allRules) {
      if (!statutory) continue;
      for (const rule of rules as readonly DatedRule<unknown>[]) {
        const canGoStale = rule.effectiveTo !== null || Boolean(rule.source?.reviewedAt);
        expect({ code, name, from: rule.effectiveFrom, canGoStale }).toEqual({
          code,
          name,
          from: rule.effectiveFrom,
          canGoStale: true,
        });
      }
    }
  });

  test('periods never overlap, so a date resolves to exactly one published rule', () => {
    for (const { code, name, rules } of allRules) {
      const sorted = [...rules].sort((left, right) =>
        left.effectiveFrom.localeCompare(right.effectiveFrom),
      );
      for (let index = 1; index < sorted.length; index += 1) {
        const previousEnd = sorted[index - 1]!.effectiveTo;
        expect({
          code,
          name,
          overlaps: previousEnd === null || previousEnd >= sorted[index]!.effectiveFrom,
        }).toEqual({
          code,
          name,
          overlaps: false,
        });
      }
    }
  });

  test('source review dates are real calendar dates', () => {
    for (const { rules } of allRules) {
      for (const rule of rules as readonly DatedRule<unknown>[]) {
        if (!rule.source) continue;
        const reviewed = rule.source.reviewedAt;
        expect(new Date(`${reviewed}T00:00:00Z`).toISOString().slice(0, 10)).toBe(reviewed);
      }
    }
  });
});

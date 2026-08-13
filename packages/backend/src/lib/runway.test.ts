/* eslint-disable complexity */
import { describe, expect, test } from 'bun:test';
import {
  calculateBurn,
  calculateIncomeSupport,
  calculateLiquidityTiers,
  calculateServiceDuration,
  simulateRunway,
} from './runway';
import { baselineIncomeSupport, baselineLiquidAssets } from './__fixtures__/runway';
import { auJurisdiction } from './jurisdictions/au';

describe('runway burn', () => {
  test('amortises annual spending and excludes employment-linked costs from lean burn', () => {
    const result = calculateBurn({
      categories: [
        {
          label: 'Insurance',
          expenseClass: 'essential',
          monthlySpend: [...Array.from({ length: 11 }, () => 100), 1_300],
          currentBudgeted: 100,
        },
        {
          label: 'Fun',
          expenseClass: 'discretionary',
          monthlySpend: Array.from({ length: 12 }, () => 50),
          currentBudgeted: 50,
        },
        {
          label: 'Commuting',
          expenseClass: 'employment_linked',
          monthlySpend: Array.from({ length: 12 }, () => 30),
          currentBudgeted: 30,
        },
      ],
      contractual: [
        { label: 'Mortgage', amount: 500, source: 'mortgage' },
        { label: 'Debt', amount: 100, source: 'debt' },
      ],
      derivedCashflowMonthly: 2_000,
      assumptions: { emergencyLifestylePct: 0.7 },
    });
    expect(result.burnSource).toBe('envelopes');
    expect(result.current).toBeCloseTo(880);
    expect(result.lean).toBeCloseTo(740);
  });

  test('uses partial history and preserves zero-spend months', () => {
    const result = calculateBurn({
      categories: [
        {
          label: 'Food',
          expenseClass: 'essential',
          monthlySpend: [400, 0, 200, 0],
          currentBudgeted: 300,
        },
      ],
      contractual: [],
      derivedCashflowMonthly: 900,
    });
    expect(result).toMatchObject({ burnSource: 'envelopes_partial', isPartialHistory: true });
    expect(result.lean).toBe(150);
  });

  test('falls back to cash flow without inventing a lean split', () => {
    const result = calculateBurn({
      categories: [],
      contractual: [],
      derivedCashflowMonthly: 1_250,
    });
    expect(result).toMatchObject({
      burnSource: 'derived_cashflow',
      current: 1_250,
      lean: 1_250,
    });
  });
});

describe('runway liquidity and income support', () => {
  test('weights joint assets, applies haircuts, and honours tier exclusions', () => {
    const tiers = calculateLiquidityTiers(
      [
        { amount: 10_000, kind: 'easy_access', isJoint: true },
        { amount: 10_000, kind: 'term_deposit' },
        { amount: 10_000, kind: 'brokerage' },
      ],
      { excludedTiers: [2] },
    );
    expect(tiers.map(({ tier, amount, included }) => ({ tier, amount, included }))).toEqual([
      { tier: 1, amount: 5_000, included: true },
      { tier: 2, amount: 10_000, included: false },
      { tier: 3, amount: 10_000, included: true },
    ]);
    expect(
      calculateLiquidityTiers([{ amount: 10_000, kind: 'easy_access', isJoint: true }], {
        countFullJointBalances: true,
      })[0].amount,
    ).toBe(10_000);
  });

  test('calculates stepped NL benefit, payslip tax, notice, and severance', () => {
    const support = calculateIncomeSupport(baselineIncomeSupport);
    expect(support).not.toBeNull();
    expect(support?.taxRateSource).toBe('payslips');
    expect(support?.effectiveTaxRate).toBeCloseTo(0.3);
    expect(support.notice.monthlyNet).toBe(4_550);
    expect(support.severance.net).toBeCloseTo(13_649.24);
    expect(support.unemployment.durationMonths).toBe(9);
    expect(support.unemployment.monthlyNetByMonth[0]).toBeCloseTo(3_412.5);
    expect(support.unemployment.monthlyNetByMonth[2]).toBeCloseTo(3_185);
  });

  test('keeps components independent when WW is unknown or employment is not eligible', () => {
    const unknownWw = calculateIncomeSupport({
      ...baselineIncomeSupport,
      assumptions: { wwWeeklyRequirement: 'unknown' },
    });
    expect(unknownWw.notice.status).toBe('included');
    expect(unknownWw.severance.status).toBe('included');
    expect(unknownWw.unemployment.status).toBe('unknown');
    const selfEmployed = calculateIncomeSupport({
      ...baselineIncomeSupport,
      employmentType: 'self_employed',
    });
    expect(selfEmployed.notice.status).toBe('not_applicable');
    expect(selfEmployed.severance.status).toBe('not_applicable');
  });

  test('derives completed months for display and exact service days for severance', () => {
    expect(calculateServiceDuration('2024-01-31', '2024-02-29')).toMatchObject({
      completedMonths: 0,
      serviceDays: 29,
    });
    expect(calculateServiceDuration('2024-01-31', '2024-03-31')).toMatchObject({
      completedMonths: 2,
      serviceDays: 60,
    });
    const ended = calculateIncomeSupport({
      ...baselineIncomeSupport,
      serviceStartDate: '2020-01-01',
      employmentEndDate: '2022-01-01',
    });
    expect(ended.severance.serviceDays).toBe(731);
  });

  test('attributes Dutch WW caps and daily-wage conversion to official sources', () => {
    const sourceIds = calculateIncomeSupport(baselineIncomeSupport).sources.map(
      (source) => source.id,
    );
    expect(sourceIds).toContain('uwv-maximum-daily-wage');
    expect(sourceIds).toContain('uwv-daily-wage-calculation');
  });

  test('uses Fair Work redundancy weeks and requires a JobSeeker estimate for Australia', () => {
    const australianInput = {
      ...baselineIncomeSupport,
      jurisdiction: auJurisdiction,
      payslips: baselineIncomeSupport.payslips.map((payslip) => ({
        ...payslip,
        currency: 'AUD' as const,
      })),
      assumptions: null,
    };
    const withoutJobSeeker = calculateIncomeSupport(australianInput);
    expect(withoutJobSeeker.severance).toMatchObject({
      status: 'included',
      gross: 24_000,
      net: 16_800,
      cap: null,
    });
    expect(withoutJobSeeker.unemployment.status).toBe('unknown');
    expect(withoutJobSeeker.sources.map((source) => source.id)).toEqual(
      expect.arrayContaining([
        'fair-work-redundancy-pay',
        'services-australia-jobseeker-eligibility',
      ]),
    );

    const withJobSeeker = calculateIncomeSupport({
      ...australianInput,
      assumptions: { benefitMonthlyOverride: 1_250, benefitMaxMonthsOverride: 6 },
    });
    expect(withJobSeeker.unemployment).toMatchObject({
      status: 'included',
      durationMonths: 6,
      durationSource: 'override',
      monthlyNetByMonth: [1_250, 1_250, 1_250, 1_250, 1_250, 1_250],
    });
  });

  test('uses jurisdiction tax fallback when no payslips exist', () => {
    const support = calculateIncomeSupport({ ...baselineIncomeSupport, payslips: [] });
    expect(support?.taxRateSource).toBe('jurisdiction_default');
    expect(support?.effectiveTaxRate).toBe(0.3);
  });
});

describe('runway ledger', () => {
  test('credits severance and income surplus before later drawdown', () => {
    const tiers = calculateLiquidityTiers(baselineLiquidAssets);
    const support = calculateIncomeSupport(baselineIncomeSupport);
    const result = simulateRunway(3_600, tiers, support);
    expect(result.monthsCashOnly).toBeCloseTo((19_700 + support.severance.net) / 3_600);
    expect(result.ledger[0]).toMatchObject({ income: 4_550, drawdown: 0 });
    expect(result.ledger[0].liquidRemaining).toBeCloseTo(
      19_700 + 9_700 * 0.98 + 18_000 * 0.85 + support.severance.net + 950,
    );
    expect(result.monthsWithIncomeSupport).toBeGreaterThan(result.monthsAllLiquid);
  });

  test('handles no liquid assets and zero burn without dividing by zero', () => {
    const emptyTiers = calculateLiquidityTiers([]);
    expect(simulateRunway(1_000, emptyTiers, null).monthsWithIncomeSupport).toBe(0);
    expect(simulateRunway(0, emptyTiers, null)).toMatchObject({
      monthsWithIncomeSupport: null,
      band: 'resilient',
    });
  });

  test('keeps an exact result when runway exceeds the ledger display cap', () => {
    const result = simulateRunway(
      1_000,
      calculateLiquidityTiers([{ amount: 2_000_000, kind: 'easy_access' }]),
      null,
    );
    expect(result.ledger).toHaveLength(1_200);
    expect(result.monthsWithIncomeSupport).toBe(2_000);
  });

  test('supports explicit benefit overrides and expiration', () => {
    const support = calculateIncomeSupport({
      ...baselineIncomeSupport,
      noticePeriodMonths: 0,
      assumptions: {
        ...baselineIncomeSupport.assumptions,
        benefitMonthlyOverride: 500,
        benefitMaxMonthsOverride: 2,
      },
    });
    const result = simulateRunway(
      1_000,
      calculateLiquidityTiers([{ amount: 1_000, kind: 'easy_access' }]),
      support,
    );
    expect(result.ledger[0].income).toBe(500);
    expect(result.ledger[2].income).toBe(0);
  });
});

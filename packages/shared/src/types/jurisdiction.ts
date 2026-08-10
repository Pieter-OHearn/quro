import type { CurrencyCode } from './index.js';

export const JURISDICTION_CODES = ['NL', 'AU', 'GENERIC'] as const;
export type JurisdictionCode = (typeof JURISDICTION_CODES)[number];

export type DatedRule<T> = {
  effectiveFrom: string;
  effectiveTo: string | null;
  value: T;
};

export type NonEmptyDatedRules<T> = readonly [DatedRule<T>, ...DatedRule<T>[]];

export type UnemploymentRule = {
  currency: CurrencyCode;
  workingDaysPerYear: number;
  maximumDailyWage: number;
  initialRate: number;
  initialRateMonths: number;
  ongoingRate: number;
  minimumDurationMonths: number;
  maximumDurationMonths: number;
  fullMonthPerYearYears: number;
  monthsPerYearAfterThreshold: number;
};

export type SeveranceRule = {
  currency: CurrencyCode;
  monthlySalaryFractionPerServiceYear: number;
  maximumAmount: number;
  annualSalaryIfHigher: boolean;
  includesHolidayAllowance: boolean;
};

export type WealthTaxRule = {
  currency: CurrencyCode;
  taxFreeAllowance: number;
  partnerTaxFreeAllowance: number;
  taxRate: number;
  deemedReturns: {
    cash: number;
    investments: number;
    debts: number;
  };
};

export type JurisdictionProfile = {
  code: JurisdictionCode;
  safeWithdrawalRate: NonEmptyDatedRules<number>;
  depositGuarantee: NonEmptyDatedRules<{
    amount: number;
    currency: CurrencyCode;
    scheme: string;
  }>;
  defaultEffectiveTaxRate: NonEmptyDatedRules<number>;
  unemploymentBenefit: NonEmptyDatedRules<UnemploymentRule> | null;
  severance: NonEmptyDatedRules<SeveranceRule> | null;
  retirementAccountAccessible: boolean;
  wealthTax: NonEmptyDatedRules<WealthTaxRule> | null;
};

export type RuleResolution<T> = {
  value: T;
  effectiveFrom: string;
  isExtrapolated: boolean;
};

export type UnemploymentEligibility = {
  eligible: boolean;
  confidence: 'derived' | 'assumed';
  unverifiedConditions: string[];
};

export function isJurisdictionCode(value: unknown): value is JurisdictionCode {
  return typeof value === 'string' && JURISDICTION_CODES.includes(value as JurisdictionCode);
}

export function resolveRule<T>(rules: NonEmptyDatedRules<T>, asOf: string): RuleResolution<T> {
  const sortedRules = [...rules].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
  const matchingRule = sortedRules.find(
    (rule) => rule.effectiveFrom <= asOf && (rule.effectiveTo === null || asOf <= rule.effectiveTo),
  );
  if (matchingRule) {
    return {
      value: matchingRule.value,
      effectiveFrom: matchingRule.effectiveFrom,
      isExtrapolated: false,
    };
  }

  const lastKnownRule = sortedRules.filter((rule) => rule.effectiveFrom <= asOf).at(-1);
  const fallbackRule = lastKnownRule ?? sortedRules[0];

  return {
    value: fallbackRule.value,
    effectiveFrom: fallbackRule.effectiveFrom,
    isExtrapolated: true,
  };
}

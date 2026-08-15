import type { PlanningJurisdictionProfile } from '@quro/shared';

export const genericJurisdiction: PlanningJurisdictionProfile = {
  code: 'GENERIC',
  safeWithdrawalRate: [{ effectiveFrom: '2025-01-01', effectiveTo: null, value: 0.035 }],
  defaultEffectiveTaxRate: [{ effectiveFrom: '2025-01-01', effectiveTo: null, value: 0.3 }],
  unemploymentBenefit: null,
  severance: null,
  retirementAccountAccessible: false,
  wealthTax: null,
};

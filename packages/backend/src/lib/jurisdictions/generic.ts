import type { JurisdictionProfile } from '@quro/shared';

export const genericJurisdiction: JurisdictionProfile = {
  code: 'GENERIC',
  safeWithdrawalRate: [{ effectiveFrom: '2025-01-01', effectiveTo: null, value: 0.035 }],
  depositGuarantee: [
    {
      effectiveFrom: '2025-01-01',
      effectiveTo: null,
      value: { amount: 100_000, currency: 'EUR', scheme: 'EU deposit guarantee' },
    },
  ],
  defaultEffectiveTaxRate: [{ effectiveFrom: '2025-01-01', effectiveTo: null, value: 0.3 }],
  unemploymentBenefit: null,
  severance: null,
  retirementAccountAccessible: false,
  wealthTax: null,
};

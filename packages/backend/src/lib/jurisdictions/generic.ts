import type { PlanningJurisdictionProfile } from '@quro/shared';

export const genericJurisdiction: PlanningJurisdictionProfile = {
  code: 'GENERIC',
  labels: {
    unemployment: 'Unemployment benefit',
    unemploymentShort: 'Unemployment support',
    severance: 'Severance pay',
    provider: 'the provider',
    severanceSalaryOverride: 'Severance monthly salary override',
    severanceSalaryHint: 'Optional; include fixed allowances used by the statutory calculation',
    benefitOverride: 'Monthly benefit override',
    benefitHint: null,
    benefitDuration: 'Benefit duration (months)',
  },
  unemploymentModel: 'none',
  sources: [],
  warnings: [],
  manualBenefit: null,

  safeWithdrawalRate: [{ effectiveFrom: '2025-01-01', effectiveTo: null, value: 0.035 }],
  defaultEffectiveTaxRate: [{ effectiveFrom: '2025-01-01', effectiveTo: null, value: 0.3 }],
  unemploymentBenefit: null,
  severance: null,
  retirementAccountAccessible: false,
  wealthTax: null,
};

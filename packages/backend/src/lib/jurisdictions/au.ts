import type { PlanningJurisdictionProfile } from '@quro/shared';

const reviewedAt = '2026-08-11';
const redundancySource = {
  id: 'fair-work-redundancy-pay',
  title: 'Notice of termination and redundancy pay',
  publisher: 'Fair Work Ombudsman',
  url: 'https://www.fairwork.gov.au/tools-and-resources/fact-sheets/minimum-workplace-entitlements/notice-of-termination-and-redundancy-pay',
  reviewedAt,
};

// Australian sources verified 2026-08-11:
// - NES redundancy: base-rate weeks table, subject to eligibility and employer exceptions.
// - JobSeeker is not derived because Services Australia applies household income and asset tests.
export const auJurisdiction: PlanningJurisdictionProfile = {
  code: 'AU',
  labels: {
    unemployment: 'JobSeeker Payment',
    unemploymentShort: 'JobSeeker',
    severance: 'Redundancy pay',
    provider: 'Services Australia',
    severanceSalaryOverride: 'Redundancy monthly base-pay override',
    severanceSalaryHint:
      'Optional; use base pay for ordinary hours, excluding bonuses and separate allowances',
    benefitOverride: 'Monthly JobSeeker estimate',
    benefitHint: 'Use an estimate based on your Services Australia circumstances',
    benefitDuration: 'JobSeeker planning duration (months)',
  },
  unemploymentModel: 'manual_estimate',
  sources: [
    {
      id: 'services-australia-jobseeker-eligibility',
      title: 'Who can get JobSeeker Payment',
      url: 'https://www.servicesaustralia.gov.au/who-can-get-jobseeker-payment?context=51411',
      publisher: 'Services Australia',
      reviewedAt: '2026-08-11',
    },
    {
      id: 'services-australia-jobseeker-means-tests',
      title: 'Income and assets tests for JobSeeker Payment',
      url: 'https://www.servicesaustralia.gov.au/income-and-assets-tests-for-jobseeker-payment?context=51411',
      publisher: 'Services Australia',
      reviewedAt: '2026-08-11',
    },
  ],
  warnings: [
    'Australian redundancy pay uses base pay for ordinary hours and can be unavailable or reduced under Fair Work exceptions.',
    'JobSeeker is household means- and assets-tested, so it is excluded until you enter an estimate and planning duration.',
  ],
  manualBenefit: {
    includedReason:
      'Uses your JobSeeker estimate and planning duration; Services Australia determines actual eligibility and payment.',
    unknownReason:
      'JobSeeker is not derived from salary. Enter the monthly estimate from Services Australia and a planning duration to include it.',
    includedConditions: [
      'age and Australian residence rules',
      'household income test',
      'household assets test',
      'mutual-obligation or temporary incapacity requirements',
    ],
    unknownConditions: [
      'age and Australian residence rules',
      'household income test',
      'household assets test',
      'unemployed, looking for work, or temporarily unable to work',
    ],
  },

  safeWithdrawalRate: [{ effectiveFrom: '2025-01-01', effectiveTo: null, value: 0.035 }],
  defaultEffectiveTaxRate: [{ effectiveFrom: '2025-07-01', effectiveTo: null, value: 0.3 }],
  unemploymentBenefit: null,
  severance: [
    {
      effectiveFrom: '2010-01-01',
      effectiveTo: null,
      source: redundancySource,
      value: {
        model: 'service_weeks',
        currency: 'AUD',
        // Index is completed years of continuous service; 10+ years remains 12 weeks.
        weeksByCompletedServiceYear: [0, 4, 6, 7, 8, 10, 11, 13, 14, 16, 12],
        weeksPerYear: 52,
      },
    },
  ],
  retirementAccountAccessible: false,
  wealthTax: null,
};

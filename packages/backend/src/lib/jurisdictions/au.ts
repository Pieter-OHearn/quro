import type { JurisdictionProfile } from '@quro/shared';

const reviewedAt = '2026-08-11';
const fcsSource = {
  id: 'apra-financial-claims-scheme',
  title: 'Financial Claims Scheme account coverage',
  publisher: 'APRA',
  url: 'https://www.apra.gov.au/types-accounts-covered-under-financial-claims-scheme',
  reviewedAt,
};
const redundancySource = {
  id: 'fair-work-redundancy-pay',
  title: 'Notice of termination and redundancy pay',
  publisher: 'Fair Work Ombudsman',
  url: 'https://www.fairwork.gov.au/tools-and-resources/fact-sheets/minimum-workplace-entitlements/notice-of-termination-and-redundancy-pay',
  reviewedAt,
};

// Australian sources verified 2026-08-11:
// - FCS: $250,000 per account holder per Australian-incorporated ADI, for AUD deposits.
// - NES redundancy: base-rate weeks table, subject to eligibility and employer exceptions.
// - JobSeeker is not derived because Services Australia applies household income and asset tests.
export const auJurisdiction: JurisdictionProfile = {
  code: 'AU',
  safeWithdrawalRate: [{ effectiveFrom: '2025-01-01', effectiveTo: null, value: 0.035 }],
  depositGuarantee: [
    {
      effectiveFrom: '2012-02-01',
      effectiveTo: null,
      source: fcsSource,
      value: {
        amount: 250_000,
        currency: 'AUD',
        scheme: 'Australian Financial Claims Scheme (AUD deposits only)',
        eligibleCurrencies: ['AUD'],
      },
    },
  ],
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

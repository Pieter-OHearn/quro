import type { PlanningJurisdictionProfile } from '@quro/shared';

const reviewedAt = '2026-08-05';
const uwvAmountSource = {
  id: 'uwv-ww-amount',
  title: 'How much WW benefit will I receive?',
  publisher: 'UWV',
  url: 'https://www.uwv.nl/nl/ww/hoogte-ww',
  reviewedAt,
};
const severanceSource = {
  id: 'rijksoverheid-transitievergoeding',
  title: 'How much transition compensation will I receive on dismissal?',
  publisher: 'Rijksoverheid',
  url: 'https://www.rijksoverheid.nl/vraag-en-antwoord/ontslag/hoe-hoog-is-de-transitievergoeding-als-ik-word-ontslagen',
  reviewedAt,
};

// Primary sources (verified 2026-08-05):
// - UWV maximum daily wage: https://www.uwv.nl/nl/premies-bedragen/maximum-dagloon
// - UWV duration: https://www.uwv.nl/nl/ww/hoelang-ww
// - UWV daily/monthly conversion: https://www.uwv.nl/nl/premies-bedragen/dagloon-berekenen
// - Rijksoverheid severance: https://www.rijksoverheid.nl/vraag-en-antwoord/ontslag/hoe-hoog-is-de-transitievergoeding-als-ik-word-ontslagen
// - Belastingdienst Box 3: https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/berekening-box-3-inkomen-2026
export const nlJurisdiction: PlanningJurisdictionProfile = {
  code: 'NL',
  labels: {
    unemployment: 'WW benefit',
    unemploymentShort: 'WW',
    severance: 'Transition compensation',
    provider: 'UWV',
    severanceSalaryOverride: 'Severance monthly salary override',
    severanceSalaryHint: 'Optional; include fixed allowances used by the statutory calculation',
    benefitOverride: 'Monthly benefit override',
    benefitHint: null,
    benefitDuration: 'Benefit duration (months)',
  },
  unemploymentModel: 'salary_replacement',
  sources: [
    {
      id: 'uwv-ww-eligibility',
      title: 'When am I entitled to WW benefit?',
      url: 'https://www.uwv.nl/nl/ww/wanneer-recht-op-ww',
      publisher: 'UWV',
      reviewedAt: '2026-08-05',
    },
    {
      id: 'uwv-ww-duration',
      title: 'How long will I receive WW benefit?',
      url: 'https://www.uwv.nl/nl/ww/hoelang-ww',
      publisher: 'UWV',
      reviewedAt: '2026-08-05',
    },
    {
      id: 'uwv-maximum-daily-wage',
      title: 'Maximum daily wage',
      url: 'https://www.uwv.nl/nl/premies-bedragen/maximum-dagloon',
      publisher: 'UWV',
      reviewedAt: '2026-08-05',
    },
    {
      id: 'uwv-daily-wage-calculation',
      title: 'Calculating daily wage',
      url: 'https://www.uwv.nl/nl/premies-bedragen/dagloon-berekenen',
      publisher: 'UWV',
      reviewedAt: '2026-08-05',
    },
  ],
  warnings: [
    'Dutch transition-pay salary can include holiday allowance and fixed pay components; use the salary override if the payslip gross does not include them.',
  ],
  manualBenefit: null,

  safeWithdrawalRate: [
    { effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', value: 0.0282 },
    { effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', value: 0.0282 },
  ],
  defaultEffectiveTaxRate: [
    { effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', value: 0.3 },
    { effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', value: 0.3 },
  ],
  unemploymentBenefit: [
    {
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-06-30',
      source: uwvAmountSource,
      value: {
        currency: 'EUR',
        workingDaysPerYear: 261,
        maximumDailyWage: 304.25,
        initialRate: 0.75,
        initialRateMonths: 2,
        ongoingRate: 0.7,
        minimumDurationMonths: 3,
        maximumDurationMonths: 24,
        fullMonthPerYearYears: 10,
        monthsPerYearAfterThreshold: 0.5,
      },
    },
    {
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-12-31',
      source: uwvAmountSource,
      value: {
        currency: 'EUR',
        workingDaysPerYear: 261,
        maximumDailyWage: 309.91,
        initialRate: 0.75,
        initialRateMonths: 2,
        ongoingRate: 0.7,
        minimumDurationMonths: 3,
        maximumDurationMonths: 24,
        fullMonthPerYearYears: 10,
        monthsPerYearAfterThreshold: 0.5,
      },
    },
  ],
  severance: [
    {
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      source: severanceSource,
      value: {
        model: 'salary_fraction',
        currency: 'EUR',
        monthlySalaryFractionPerServiceYear: 1 / 3,
        maximumAmount: 102_000,
        annualSalaryIfHigher: true,
        includesHolidayAllowance: true,
      },
    },
  ],
  retirementAccountAccessible: false,
  wealthTax: [
    {
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      value: {
        currency: 'EUR',
        taxFreeAllowance: 59_357,
        partnerTaxFreeAllowance: 118_714,
        taxRate: 0.36,
        deemedReturns: { cash: 0.0128, investments: 0.06, debts: 0.027 },
      },
    },
  ],
};

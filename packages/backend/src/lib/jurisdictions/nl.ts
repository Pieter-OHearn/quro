import type { JurisdictionProfile } from '@quro/shared';

// Primary sources (verified 2026-08-05):
// - UWV maximum daily wage: https://www.uwv.nl/nl/premies-bedragen/maximum-dagloon
// - UWV duration: https://www.uwv.nl/nl/ww/hoelang-ww
// - UWV daily/monthly conversion: https://www.uwv.nl/nl/premies-bedragen/dagloon-berekenen
// - Rijksoverheid severance: https://www.rijksoverheid.nl/vraag-en-antwoord/ontslag/hoe-hoog-is-de-transitievergoeding-als-ik-word-ontslagen
// - Belastingdienst Box 3: https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/berekening-box-3-inkomen-2026
// - DNB deposit guarantee: https://www.dnb.nl/betrouwbare-financiele-sector/nederlandse-depositogarantie/vragen-nederlandse-depositogarantie/
export const nlJurisdiction: JurisdictionProfile = {
  code: 'NL',
  safeWithdrawalRate: [
    { effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', value: 0.0282 },
    { effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', value: 0.0282 },
  ],
  depositGuarantee: [
    {
      effectiveFrom: '2025-01-01',
      effectiveTo: '2026-12-31',
      value: { amount: 100_000, currency: 'EUR', scheme: 'Nederlandse Depositogarantie' },
    },
  ],
  defaultEffectiveTaxRate: [
    { effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31', value: 0.3 },
    { effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', value: 0.3 },
  ],
  unemploymentBenefit: [
    {
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-06-30',
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
      value: {
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

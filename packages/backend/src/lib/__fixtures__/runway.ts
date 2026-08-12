import type { IncomeSupportInput, LiquidAssetInput } from '../runway';
import { nlJurisdiction } from '../jurisdictions/nl';

export const baselineLiquidAssets: LiquidAssetInput[] = [
  { amount: 19_700, kind: 'easy_access' },
  { amount: 9_700, kind: 'term_deposit' },
  { amount: 18_000, kind: 'brokerage' },
];

export const baselineIncomeSupport: IncomeSupportInput = {
  jurisdiction: nlJurisdiction,
  asOf: '2026-08-05',
  employmentType: 'employed',
  serviceStartDate: '2017-08-05',
  employmentEndDate: null,
  noticePeriodMonths: 1,
  salaryBasisStatus: 'linked_payslips',
  payslips: Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    date: `2026-${String(8 - Math.min(index, 7)).padStart(2, '0')}-01`,
    gross: 6_500,
    tax: 1_950,
    net: 4_550,
    currency: 'EUR',
  })),
  assumptions: { wwWeeklyRequirement: 'met', wwDurationMonths: 9 },
};

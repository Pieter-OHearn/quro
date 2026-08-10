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
  tenureMonths: 108,
  noticePeriodMonths: 1,
  payslips: Array.from({ length: 12 }, () => ({ gross: 6_500, tax: 1_950, net: 4_550 })),
};

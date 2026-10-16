import { sumMoney, type CurrencyCode, type Payslip } from '@quro/shared';
import type { FmtFn, SalaryChartEntry, SalaryHistoryEntry, SalaryStatCard } from '../types';

const DATE_YEAR_LENGTH = 4;
const MIN_GROWTH_POINTS = 2;

export type BreakdownLineKey = 'gross' | 'bonus' | 'tax' | 'pension' | 'net';

export type BreakdownLine = {
  key: BreakdownLineKey;
  label: string;
  /** Swatch class for the legend dot; the same colour as its bar segment. */
  color: string;
  /** Signed in the base currency: deductions are negative, a correction is positive. */
  value: number;
  /** The same line on the payslip being compared, or null when none is chosen. */
  compareValue: number | null;
  /** `value` minus `compareValue`; its sign already reads as a gain or a loss. */
  change: number | null;
  /** Share of the pay the line takes (take-home, tax, pension), as a percentage. */
  pct?: number;
};

type ToBaseFn = (amount: number, fromCurrency: CurrencyCode) => number;

export const getPayslipBreakdownTotal = (
  payslip: Pick<Payslip, 'net' | 'tax' | 'pension'>,
): number => Math.abs(payslip.net) + Math.abs(payslip.tax) + Math.abs(payslip.pension);

const getPayslipAnnualGross = (payslip: Pick<Payslip, 'gross' | 'bonus'>): number =>
  payslip.gross + (payslip.bonus ?? 0);

const percentageOfTotal = (value: number, total: number): number =>
  total > 0 ? (value / total) * 100 : 0;

const buildSalaryChartDataFromHistory = (
  salaryHistory: readonly SalaryHistoryEntry[],
  convertToBase: (amount: number, fromCurrency: CurrencyCode) => number,
): SalaryChartEntry[] =>
  Array.from(
    salaryHistory.reduce((grossByYear, entry) => {
      const annualTotal = grossByYear.get(entry.year) ?? 0;
      grossByYear.set(entry.year, annualTotal + convertToBase(entry.annualSalary, entry.currency));
      return grossByYear;
    }, new Map<number, number>()),
  )
    .sort(([leftYear], [rightYear]) => leftYear - rightYear)
    .map(([year, gross]) => ({ year: String(year), gross, net: gross }));

const signedLineValue = (payslip: Payslip, key: BreakdownLineKey): number => {
  if (key === 'gross') return payslip.gross;
  if (key === 'bonus') return payslip.bonus ?? 0;
  if (key === 'tax') return -payslip.tax;
  if (key === 'pension') return -payslip.pension;
  return payslip.net;
};

/**
 * The gross-to-net lines of a payslip in the base currency, each next to the same line of another
 * payslip. A deduction is negative, so more tax than the other month reads as a loss.
 */
export const buildBreakdownLines = (
  payslip: Payslip,
  compareTo: Payslip | null,
  convertToBase: ToBaseFn,
): BreakdownLine[] => {
  const totalPay = getPayslipBreakdownTotal(payslip);
  const showBonus = Boolean(payslip.bonus) || Boolean(compareTo?.bonus);
  const lines: Omit<BreakdownLine, 'value' | 'compareValue' | 'change'>[] = [
    { key: 'gross', label: 'Gross pay', color: 'bg-fg' },
    ...(showBonus ? [{ key: 'bonus' as const, label: 'Bonus', color: 'bg-viz-5' }] : []),
    { key: 'tax', label: payslip.tax < 0 ? 'Tax correction' : 'Income tax', color: 'bg-viz-6' },
    {
      key: 'pension',
      label: payslip.pension < 0 ? 'Pension correction' : 'Pension',
      color: 'bg-viz-3',
    },
    { key: 'net', label: 'Take-home pay', color: 'bg-viz-1' },
  ];

  return lines.map((line) => {
    const value = convertToBase(signedLineValue(payslip, line.key), payslip.currency);
    const compareValue = compareTo
      ? convertToBase(signedLineValue(compareTo, line.key), compareTo.currency)
      : null;
    return {
      ...line,
      value,
      compareValue,
      change: compareValue === null ? null : sumMoney([value, -compareValue]),
      pct:
        line.key === 'gross' || line.key === 'bonus'
          ? undefined
          : percentageOfTotal(Math.abs(signedLineValue(payslip, line.key)), totalPay),
    };
  });
};

/** The payslip dated just before `payslip`, across every year, or null for the first one. */
export const findPreviousPayslip = (
  payslip: Pick<Payslip, 'id' | 'date'>,
  payslips: readonly Payslip[],
): Payslip | null =>
  payslips
    .filter(
      (candidate) =>
        candidate.id !== payslip.id &&
        (candidate.date < payslip.date ||
          (candidate.date === payslip.date && candidate.id < payslip.id)),
    )
    .sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id)[0] ?? null;

export const buildSalaryStatCards = (
  fmtBase: FmtFn,
  gross: number,
  net: number,
  tax: number,
  pension: number,
  activeYear: number,
  currentYear: number,
): SalaryStatCard[] => [
  {
    label: 'Annual gross',
    value: fmtBase(gross),
    sub: activeYear === currentYear ? 'Total this year' : `Total in ${activeYear}`,
  },
  {
    label: 'Annual net',
    value: fmtBase(net),
    sub: 'After all deductions',
  },
  {
    label: `Tax paid (${activeYear === currentYear ? 'YTD' : activeYear})`,
    value: fmtBase(tax),
    sub: activeYear === currentYear ? 'Income tax' : `Income tax in ${activeYear}`,
  },
  {
    label: 'Pension contributions',
    value: fmtBase(pension),
    sub:
      activeYear === currentYear ? 'Your contributions YTD' : `Your contributions in ${activeYear}`,
  },
];

export const parsePayslipYear = (payslip: Pick<Payslip, 'date'>, fallbackYear: number): number => {
  const year = Number.parseInt(payslip.date.slice(0, DATE_YEAR_LENGTH), 10);
  return Number.isFinite(year) ? year : fallbackYear;
};

export const computeSalaryYears = (payslips: readonly Payslip[], currentYear: number): number[] => {
  const uniqueYears = new Set<number>();
  for (const payslip of payslips) {
    uniqueYears.add(parsePayslipYear(payslip, currentYear));
  }
  uniqueYears.add(currentYear);
  return [...uniqueYears].sort((a, b) => a - b);
};

export function computeSalaryMetrics(
  annualPayslips: readonly Payslip[],
  allPayslips: readonly Payslip[],
  salaryHistory: readonly SalaryHistoryEntry[],
  convertToBase: (amount: number, fromCurrency: CurrencyCode) => number,
  currentYear: number,
) {
  const annualGross = annualPayslips.reduce(
    (sum, payslip) => sum + convertToBase(getPayslipAnnualGross(payslip), payslip.currency),
    0,
  );
  const annualNet = annualPayslips.reduce(
    (sum, payslip) => sum + convertToBase(payslip.net, payslip.currency),
    0,
  );
  const annualTax = annualPayslips.reduce(
    (sum, payslip) => sum + convertToBase(payslip.tax, payslip.currency),
    0,
  );
  const annualPension = annualPayslips.reduce(
    (sum, payslip) => sum + convertToBase(payslip.pension, payslip.currency),
    0,
  );

  const payslipDataByYear = allPayslips.reduce((byYear, payslip) => {
    const year = parsePayslipYear(payslip, currentYear);
    const existing = byYear.get(year) ?? { gross: 0, net: 0 };
    byYear.set(year, {
      gross: existing.gross + convertToBase(getPayslipAnnualGross(payslip), payslip.currency),
      net: existing.net + convertToBase(payslip.net, payslip.currency),
    });
    return byYear;
  }, new Map<number, { gross: number; net: number }>());

  const salaryChartData: SalaryChartEntry[] =
    salaryHistory.length > 0
      ? buildSalaryChartDataFromHistory(salaryHistory, convertToBase).map((entry) => {
          const payslipData = payslipDataByYear.get(Number(entry.year));
          return payslipData !== undefined
            ? { year: entry.year, gross: payslipData.gross, net: payslipData.net }
            : entry;
        })
      : Array.from(payslipDataByYear)
          .sort(([leftYear], [rightYear]) => leftYear - rightYear)
          .map(([year, { gross, net }]) => ({ year: String(year), gross, net }));

  const salaryGrowthPct =
    salaryChartData.length >= MIN_GROWTH_POINTS && salaryChartData[0].gross > 0
      ? ((salaryChartData[salaryChartData.length - 1].gross - salaryChartData[0].gross) /
          salaryChartData[0].gross) *
        100
      : 0;

  return { annualGross, annualNet, annualTax, annualPension, salaryChartData, salaryGrowthPct };
}

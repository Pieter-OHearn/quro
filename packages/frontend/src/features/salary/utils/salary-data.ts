import type { CurrencyCode, Payslip } from '@quro/shared';
import { ArrowUpRight, Briefcase, Calculator, ShieldCheck } from 'lucide-react';
import type { FmtFn, SalaryChartEntry, SalaryHistoryEntry, SalaryStatCard } from '../types';

const DATE_YEAR_LENGTH = 4;
const MIN_GROWTH_POINTS = 2;

export type SalaryBreakdownItem = {
  label: string;
  val: number;
  color: string;
  tc: string;
  pct?: number;
};

export const getPayslipBreakdownTotal = (payslip: Pick<Payslip, 'gross' | 'bonus'>): number =>
  payslip.gross + (payslip.bonus ?? 0);

const percentageOfTotal = (value: number, total: number): number =>
  total > 0 ? (value / total) * 100 : 0;

export const buildBreakdownItems = (payslip: Payslip): SalaryBreakdownItem[] => {
  const totalPay = getPayslipBreakdownTotal(payslip);

  return [
    {
      label: 'Gross Pay',
      val: payslip.gross,
      color: 'bg-slate-200',
      tc: 'text-slate-700',
    },
    ...(payslip.bonus
      ? [
          {
            label: 'Bonus',
            val: payslip.bonus,
            color: 'bg-amber-200',
            tc: 'text-amber-700',
          },
        ]
      : []),
    {
      label: 'Take-Home Pay',
      val: payslip.net,
      color: 'bg-emerald-500',
      tc: 'text-emerald-700',
      pct: percentageOfTotal(payslip.net, totalPay),
    },
    {
      label: 'Income Tax',
      val: -payslip.tax,
      color: 'bg-rose-400',
      tc: 'text-rose-600',
      pct: percentageOfTotal(payslip.tax, totalPay),
    },
    {
      label: 'Pension',
      val: -payslip.pension,
      color: 'bg-indigo-400',
      tc: 'text-indigo-600',
      pct: percentageOfTotal(payslip.pension, totalPay),
    },
  ];
};

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
    label: 'Annual Gross',
    value: fmtBase(gross),
    sub: activeYear === currentYear ? 'Total this year' : `Total in ${activeYear}`,
    icon: Briefcase,
    color: 'indigo',
  },
  {
    label: 'Annual Net',
    value: fmtBase(net),
    sub: 'After all deductions',
    icon: ArrowUpRight,
    color: 'emerald',
  },
  {
    label: `Tax Paid (${activeYear === currentYear ? 'YTD' : activeYear})`,
    value: fmtBase(tax),
    sub: activeYear === currentYear ? 'Income tax' : `Income tax in ${activeYear}`,
    icon: Calculator,
    color: 'rose',
  },
  {
    label: 'Pension Contrib.',
    value: fmtBase(pension),
    sub:
      activeYear === currentYear ? 'Your contributions YTD' : `Your contributions in ${activeYear}`,
    icon: ShieldCheck,
    color: 'amber',
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
    (sum, payslip) => sum + convertToBase(payslip.gross, payslip.currency),
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

  const salaryChartData: SalaryChartEntry[] =
    salaryHistory.length > 0
      ? [...salaryHistory]
          .sort((left, right) => left.year - right.year)
          .map((entry) => ({
            year: String(entry.year),
            gross: convertToBase(entry.annualSalary, entry.currency),
          }))
      : Array.from(
          allPayslips.reduce((grossByYear, payslip) => {
            const year = parsePayslipYear(payslip, currentYear);
            const annualTotal = grossByYear.get(year) ?? 0;
            grossByYear.set(year, annualTotal + convertToBase(payslip.gross, payslip.currency));
            return grossByYear;
          }, new Map<number, number>()),
        )
          .sort(([leftYear], [rightYear]) => leftYear - rightYear)
          .map(([year, gross]) => ({ year: String(year), gross }));

  const salaryGrowthPct =
    salaryChartData.length >= MIN_GROWTH_POINTS && salaryChartData[0].gross > 0
      ? ((salaryChartData[salaryChartData.length - 1].gross - salaryChartData[0].gross) /
          salaryChartData[0].gross) *
        100
      : 0;

  return { annualGross, annualNet, annualTax, annualPension, salaryChartData, salaryGrowthPct };
}

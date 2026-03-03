import type { Payslip } from '@quro/shared';
import { ArrowUpRight, Briefcase, Calculator, ShieldCheck } from 'lucide-react';
import type { FmtFn, SalaryChartEntry, SalaryHistoryEntry, SalaryStatCard } from '../types';

export type SalaryBreakdownItem = {
  label: string;
  val: number;
  color: string;
  tc: string;
  pct?: number;
};

export const buildBreakdownItems = (payslip: Payslip): SalaryBreakdownItem[] => [
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
    pct: (payslip.net / payslip.gross) * 100,
  },
  {
    label: 'Income Tax',
    val: -payslip.tax,
    color: 'bg-rose-400',
    tc: 'text-rose-600',
    pct: (payslip.tax / payslip.gross) * 100,
  },
  {
    label: 'Pension',
    val: -payslip.pension,
    color: 'bg-indigo-400',
    tc: 'text-indigo-600',
    pct: (payslip.pension / payslip.gross) * 100,
  },
];

export const buildSalaryStatCards = (
  fmtBase: FmtFn,
  gross: number,
  net: number,
  tax: number,
  pension: number,
): SalaryStatCard[] => [
  {
    label: 'Annual Gross',
    value: fmtBase(gross),
    sub: 'Total this year',
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
    label: 'Tax Paid (YTD)',
    value: fmtBase(tax),
    sub: 'Income tax',
    icon: Calculator,
    color: 'rose',
  },
  {
    label: 'Pension Contrib.',
    value: fmtBase(pension),
    sub: 'Your contributions YTD',
    icon: ShieldCheck,
    color: 'amber',
  },
];

export function computeSalaryMetrics(
  payslips: readonly Payslip[],
  salaryHistory: readonly SalaryHistoryEntry[],
) {
  const annualGross = payslips.reduce((sum, payslip) => sum + payslip.gross, 0);
  const annualNet = payslips.reduce((sum, payslip) => sum + payslip.net, 0);
  const annualTax = payslips.reduce((sum, payslip) => sum + payslip.tax, 0);
  const annualPension = payslips.reduce((sum, payslip) => sum + payslip.pension, 0);

  const salaryChartData: SalaryChartEntry[] = salaryHistory.map((entry) => ({
    year: String(entry.year),
    gross: entry.annualSalary,
  }));

  const salaryGrowthPct =
    salaryChartData.length >= 2
      ? ((salaryChartData[salaryChartData.length - 1].gross - salaryChartData[0].gross) /
          salaryChartData[0].gross) *
        100
      : 0;

  return { annualGross, annualNet, annualTax, annualPension, salaryChartData, salaryGrowthPct };
}

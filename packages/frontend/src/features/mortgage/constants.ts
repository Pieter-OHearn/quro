import { Home, Landmark, Percent } from 'lucide-react';

export type MortgageTxnType = 'repayment' | 'valuation' | 'rate_change';

export const TXN_META: Record<
  MortgageTxnType,
  {
    label: string;
    icon: typeof Landmark;
    color: string;
    bg: string;
    borderColor: string;
  }
> = {
  repayment: {
    label: 'Repayment',
    icon: Landmark,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
  },
  valuation: {
    label: 'Valuation',
    icon: Home,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
  },
  rate_change: {
    label: 'Rate Change',
    icon: Percent,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    borderColor: 'border-amber-300',
  },
};

const SCHEDULE_START_YEAR = 2026;
const SCHEDULE_END_YEAR = 2047;
const SCHEDULE_YEAR_STEP = 2;

export function generateSchedule(balance: number, rate: number, monthlyPayment: number) {
  const schedule = [];
  const monthlyRate = rate / 100 / 12;
  for (let year = SCHEDULE_START_YEAR; year <= SCHEDULE_END_YEAR; year += SCHEDULE_YEAR_STEP) {
    const interest = balance * monthlyRate * 12;
    const principal = monthlyPayment * 12 - interest;
    balance = Math.max(0, balance - principal);
    schedule.push({
      year: year.toString(),
      balance: Math.round(balance),
      principal: Math.round(principal),
      interest: Math.round(interest),
    });
    if (balance === 0) break;
  }
  return schedule;
}

export const FILTER_OPTIONS = ['all', 'repayment', 'valuation', 'rate_change'] as const;

import { ArrowUpRight, CircleMinus, Landmark } from 'lucide-react';
import type { PensionTxnType } from './types';

export const PENSION_TXN_META: Record<
  PensionTxnType,
  {
    label: string;
    icon: typeof Landmark;
    color: string;
    bg: string;
    borderColor: string;
  }
> = {
  contribution: {
    label: 'Contribution',
    icon: ArrowUpRight,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
  },
  fee: {
    label: 'Fee',
    icon: CircleMinus,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    borderColor: 'border-rose-300',
  },
};

export const PENSION_TYPES = [
  'Workplace',
  'SIPP',
  'Superannuation',
  'Final Salary',
  'Other',
] as const;

export const TYPE_COLORS: Record<string, string> = {
  Workplace: 'bg-indigo-100 text-indigo-700',
  SIPP: 'bg-sky-100 text-sky-700',
  Superannuation: 'bg-amber-100 text-amber-700',
  'Final Salary': 'bg-emerald-100 text-emerald-700',
  Other: 'bg-slate-100 text-slate-600',
};

export const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f97316', '#ec4899'];

/** Annual growth rate assumption for pension projections (5%) */
export const ANNUAL_GROWTH_RATE = 0.05;

/** Assumed years of drawdown in retirement (used for monthly drawdown estimate) */
export const DRAWDOWN_YEARS = 25;

import { Home, Landmark, Percent } from 'lucide-react';
import type { MortgageTxnType } from '../types';

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

export const MORTGAGE_TXN_TYPES: MortgageTxnType[] = ['repayment', 'valuation', 'rate_change'];
export const MORTGAGE_TXN_FILTER_OPTIONS = ['all', ...MORTGAGE_TXN_TYPES] as const;

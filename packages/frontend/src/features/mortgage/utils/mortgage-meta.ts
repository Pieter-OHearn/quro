import { MORTGAGE_TRANSACTION_TYPES } from '@quro/shared';
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
    color: 'text-brand',
    bg: 'bg-brand-soft',
    borderColor: 'border-brand-border',
  },
  valuation: {
    label: 'Valuation',
    icon: Home,
    color: 'text-success',
    bg: 'bg-success-soft',
    borderColor: 'border-success-border-strong',
  },
  rate_change: {
    label: 'Rate Change',
    icon: Percent,
    color: 'text-warning',
    bg: 'bg-warning-soft',
    borderColor: 'border-warning-border-strong',
  },
};

export const MORTGAGE_TXN_TYPES = MORTGAGE_TRANSACTION_TYPES;
export const MORTGAGE_TXN_FILTER_OPTIONS = ['all', ...MORTGAGE_TXN_TYPES] as const;

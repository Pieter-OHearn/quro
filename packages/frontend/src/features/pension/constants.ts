import { DATA_COLORS } from '@/lib/dataColors';
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
    color: 'text-success',
    bg: 'bg-success-soft',
    borderColor: 'border-success-border-strong',
  },
  fee: {
    label: 'Fee',
    icon: CircleMinus,
    color: 'text-danger',
    bg: 'bg-danger-soft',
    borderColor: 'border-danger-border-strong',
  },
  annual_statement: {
    label: 'Annual Statement',
    icon: Landmark,
    color: 'text-warning-fg',
    bg: 'bg-warning-soft',
    borderColor: 'border-warning-border-strong',
  },
};

export const PENSION_TYPES = [
  'Workplace Pension',
  'Personal Pension',
  'State Pension',
  'Other',
] as const;

export const TYPE_COLORS: Record<string, string> = {
  'Workplace Pension': 'bg-brand-soft-strong text-brand-fg',
  'Personal Pension': 'bg-info-soft-strong text-info-fg',
  'State Pension': 'bg-warning-soft-strong text-warning-fg',
  Other: 'bg-surface-muted text-fg-muted',
};

export const PALETTE = [
  DATA_COLORS['primary'],
  DATA_COLORS['cash'],
  DATA_COLORS['income'],
  DATA_COLORS['forecast'],
  DATA_COLORS['property'],
  DATA_COLORS['milestone'],
];

/** Annual growth rate assumption for pension projections (5%) */
export const ANNUAL_GROWTH_RATE = 0.05;

/** Assumed years of drawdown in retirement (used for monthly drawdown estimate) */
export const DRAWDOWN_YEARS = 25;

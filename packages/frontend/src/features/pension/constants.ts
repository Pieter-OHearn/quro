import { DATA_COLORS } from '@/lib/dataColors';
import { ArrowUpRight, CircleMinus, Landmark } from 'lucide-react';
import type { PensionTxnType } from './types';

// Icon colours follow the amounts: contributions are money in, fees and statements are not.
export const PENSION_TXN_META: Record<
  PensionTxnType,
  { label: string; icon: typeof Landmark; color: string }
> = {
  contribution: { label: 'Contribution', icon: ArrowUpRight, color: 'text-gain' },
  fee: { label: 'Fee', icon: CircleMinus, color: 'text-fg-muted' },
  annual_statement: { label: 'Annual statement', icon: Landmark, color: 'text-fg-muted' },
};

export const PENSION_TYPES = [
  'Workplace Pension',
  'Personal Pension',
  'State Pension',
  'Other',
] as const;

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

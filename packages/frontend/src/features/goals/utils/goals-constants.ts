import { DATA_COLORS } from '@/lib/dataColors';
import type { ElementType } from 'react';
import {
  BarChart2,
  Briefcase,
  ClipboardList,
  PiggyBank,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type { GoalType } from '@quro/shared';
import type { FilterKey, GoalMeta, GoalStatus } from '../types';

export const COLORS = [
  DATA_COLORS['primary'],
  DATA_COLORS['cash'],
  DATA_COLORS['forecast'],
  DATA_COLORS['income'],
  DATA_COLORS['property'],
  DATA_COLORS['milestone'],
  DATA_COLORS['recurring'],
  DATA_COLORS['portfolio'],
  DATA_COLORS['liquidity'],
  DATA_COLORS['portfolio-muted'],
  DATA_COLORS['expense-muted'],
  DATA_COLORS['neutral'],
] as const;

export const GOAL_TYPE_META: Record<GoalType, GoalMeta> = {
  savings: {
    label: 'Savings Goal',
    Icon: PiggyBank,
    bg: 'bg-brand-soft',
    text: 'text-brand',
    filterKey: 'savings',
    description: 'Save up to a target amount',
  },
  salary: {
    label: 'Career',
    Icon: Briefcase,
    bg: 'bg-success-soft',
    text: 'text-success',
    filterKey: 'career',
    description: 'Hit a gross salary milestone',
  },
  invest_habit: {
    label: 'Invest Habit',
    Icon: RefreshCw,
    bg: 'bg-info-soft',
    text: 'text-info',
    filterKey: 'investing',
    description: 'Invest a set amount every month',
  },
  portfolio: {
    label: 'Portfolio Value',
    Icon: BarChart2,
    bg: 'bg-info-soft',
    text: 'text-info',
    filterKey: 'investing',
    description: 'Grow your portfolio to a target',
  },
  net_worth: {
    label: 'Net Worth',
    Icon: Trophy,
    bg: 'bg-accent-highlight-soft',
    text: 'text-accent-highlight',
    filterKey: 'annual',
    description: 'Reach a total net worth milestone',
  },
  annual: {
    label: 'Annual Goal',
    Icon: ClipboardList,
    bg: 'bg-accent-secondary-soft',
    text: 'text-accent-secondary',
    filterKey: 'annual',
    description: 'Yearly financial habit or target',
  },
};

export const STATUS_META: Record<GoalStatus, { label: string; color: string; dot: string }> = {
  complete: {
    label: 'Completed',
    color: 'text-success-fg bg-success-soft-strong',
    dot: 'bg-success-accent',
  },
  on_track: {
    label: 'On Track',
    color: 'text-brand-fg bg-brand-soft-strong',
    dot: 'bg-brand-accent',
  },
  at_risk: {
    label: 'At Risk',
    color: 'text-warning-fg bg-warning-soft-strong',
    dot: 'bg-warning-accent',
  },
  pending: {
    label: 'In Progress',
    color: 'text-fg-muted bg-surface-muted',
    dot: 'bg-fg-faint',
  },
};

export const FILTERS: { key: FilterKey; label: string; Icon: ElementType }[] = [
  { key: 'all', label: 'All', Icon: Target },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'career', label: 'Career', Icon: Briefcase },
  { key: 'investing', label: 'Investing', Icon: TrendingUp },
  { key: 'annual', label: 'Annual', Icon: ClipboardList },
];

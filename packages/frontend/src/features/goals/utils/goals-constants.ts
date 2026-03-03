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

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#f59e0b',
  '#10b981',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#06b6d4',
  '#a78bfa',
  '#fb7185',
  '#94a3b8',
] as const;

export const GOAL_TYPE_META: Record<GoalType, GoalMeta> = {
  savings: {
    label: 'Savings Goal',
    Icon: PiggyBank,
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    filterKey: 'savings',
    description: 'Save up to a target amount',
  },
  salary: {
    label: 'Career',
    Icon: Briefcase,
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    filterKey: 'career',
    description: 'Hit a gross salary milestone',
  },
  invest_habit: {
    label: 'Invest Habit',
    Icon: RefreshCw,
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    filterKey: 'investing',
    description: 'Invest a set amount every month',
  },
  portfolio: {
    label: 'Portfolio Value',
    Icon: BarChart2,
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    filterKey: 'investing',
    description: 'Grow your portfolio to a target',
  },
  net_worth: {
    label: 'Net Worth',
    Icon: Trophy,
    bg: 'bg-pink-50',
    text: 'text-pink-600',
    filterKey: 'annual',
    description: 'Reach a total net worth milestone',
  },
  annual: {
    label: 'Annual Goal',
    Icon: ClipboardList,
    bg: 'bg-teal-50',
    text: 'text-teal-600',
    filterKey: 'annual',
    description: 'Yearly financial habit or target',
  },
};

export const STATUS_META: Record<GoalStatus, { label: string; color: string; dot: string }> = {
  complete: {
    label: 'Completed',
    color: 'text-emerald-700 bg-emerald-100',
    dot: 'bg-emerald-500',
  },
  on_track: {
    label: 'On Track',
    color: 'text-indigo-700 bg-indigo-100',
    dot: 'bg-indigo-500',
  },
  at_risk: {
    label: 'At Risk',
    color: 'text-amber-700 bg-amber-100',
    dot: 'bg-amber-500',
  },
  pending: {
    label: 'In Progress',
    color: 'text-slate-600 bg-slate-100',
    dot: 'bg-slate-400',
  },
};

export const FILTERS: { key: FilterKey; label: string; Icon: ElementType }[] = [
  { key: 'all', label: 'All', Icon: Target },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'career', label: 'Career', Icon: Briefcase },
  { key: 'investing', label: 'Investing', Icon: TrendingUp },
  { key: 'annual', label: 'Annual', Icon: ClipboardList },
];

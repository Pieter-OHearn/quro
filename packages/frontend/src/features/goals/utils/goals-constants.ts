import type { BadgeProps } from '@/components/ui';
import { CATEGORY_COLORS } from '@/lib/dataColors';
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

type GoalStatusTone = NonNullable<BadgeProps['tone']>;

// The six category colours; a saved legacy colour keeps displaying through `dataColorToken()`.
export const COLORS = CATEGORY_COLORS;

// Goal chips use the lilac `secondary` colour that marks goals.
export const GOAL_CHIP_CLASS_NAME = 'border-transparent bg-secondary-soft text-secondary';

export const GOAL_TYPE_META: Record<GoalType, GoalMeta> = {
  savings: {
    label: 'Savings goal',
    Icon: PiggyBank,
    filterKey: 'savings',
    description: 'Save up to a target amount',
  },
  salary: {
    label: 'Career',
    Icon: Briefcase,
    filterKey: 'career',
    description: 'Hit a gross salary milestone',
  },
  invest_habit: {
    label: 'Invest habit',
    Icon: RefreshCw,
    filterKey: 'investing',
    description: 'Invest a set amount every month',
  },
  portfolio: {
    label: 'Portfolio value',
    Icon: BarChart2,
    filterKey: 'investing',
    description: 'Grow your portfolio to a target',
  },
  net_worth: {
    label: 'Net worth',
    Icon: Trophy,
    filterKey: 'annual',
    description: 'Reach a total net worth milestone',
  },
  annual: {
    label: 'Annual goal',
    Icon: ClipboardList,
    filterKey: 'annual',
    description: 'Yearly financial habit or target',
  },
};

export const STATUS_META: Record<GoalStatus, { label: string; tone: GoalStatusTone }> = {
  complete: { label: 'Completed', tone: 'success' },
  on_track: { label: 'On track', tone: 'brand' },
  at_risk: { label: 'At risk', tone: 'warning' },
  pending: { label: 'In progress', tone: 'neutral' },
};

export const FILTERS: { key: FilterKey; label: string; Icon: ElementType }[] = [
  { key: 'all', label: 'All', Icon: Target },
  { key: 'savings', label: 'Savings', Icon: PiggyBank },
  { key: 'career', label: 'Career', Icon: Briefcase },
  { key: 'investing', label: 'Investing', Icon: TrendingUp },
  { key: 'annual', label: 'Annual', Icon: ClipboardList },
];

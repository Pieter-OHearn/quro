import { DATA_COLORS } from '@/lib/dataColors';
import type { ElementType } from 'react';
import type { DebtType } from '@quro/shared';
import {
  AlertTriangle,
  Banknote,
  Car,
  CreditCard,
  GraduationCap,
  MoreHorizontal,
  User,
} from 'lucide-react';
import type { DebtFilterValue, DebtFormState } from './types';

export const DEBT_COLORS = [
  DATA_COLORS['primary'],
  DATA_COLORS['cash'],
  DATA_COLORS['alert'],
  DATA_COLORS['forecast'],
  DATA_COLORS['income'],
  DATA_COLORS['milestone'],
  DATA_COLORS['portfolio'],
];

export const DEFAULT_EMOJI_BY_TYPE: Record<DebtType, string> = {
  car_loan: '🚗',
  student_loan: '🎓',
  personal_loan: '💼',
  credit_card: '💳',
  overdraft: '⚠️',
  other: '📋',
};

export const DEBT_TYPE_META: Record<
  DebtType,
  {
    label: string;
    icon: ElementType;
    toneClassName: string;
  }
> = {
  car_loan: {
    label: 'Car Loan',
    icon: Car,
    toneClassName: 'bg-brand-soft text-brand-fg border-brand-tint',
  },
  student_loan: {
    label: 'Student Loan',
    icon: GraduationCap,
    toneClassName: 'bg-info-soft text-info-fg border-info-border',
  },
  personal_loan: {
    label: 'Personal Loan',
    icon: User,
    toneClassName: 'bg-warning-soft text-warning-fg border-warning-border',
  },
  credit_card: {
    label: 'Credit Card',
    icon: CreditCard,
    toneClassName: 'bg-danger-soft text-danger-fg border-danger-border',
  },
  overdraft: {
    label: 'Overdraft',
    icon: AlertTriangle,
    toneClassName: 'bg-accent-warm-soft text-accent-warm-fg border-accent-warm-border',
  },
  other: {
    label: 'Other',
    icon: MoreHorizontal,
    toneClassName: 'bg-surface-muted text-fg-strong border-border-default',
  },
};

export const FILTER_OPTIONS: Array<{ key: DebtFilterValue; label: string; icon: ElementType }> = [
  { key: 'all', label: 'All', icon: Banknote },
  { key: 'car_loan', label: 'Car', icon: Car },
  { key: 'student_loan', label: 'Student', icon: GraduationCap },
  { key: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { key: 'personal_loan', label: 'Personal', icon: User },
  { key: 'overdraft', label: 'Overdraft', icon: AlertTriangle },
  { key: 'other', label: 'Other', icon: MoreHorizontal },
];

export const EMPTY_DEBT_FORM: DebtFormState = {
  name: '',
  type: 'car_loan',
  lender: '',
  originalAmount: '',
  remainingBalance: '',
  currency: 'EUR',
  interestRate: '',
  monthlyPayment: '',
  startDate: '',
  endDate: '',
  color: DEBT_COLORS[0],
  emoji: DEFAULT_EMOJI_BY_TYPE.car_loan,
  notes: '',
};

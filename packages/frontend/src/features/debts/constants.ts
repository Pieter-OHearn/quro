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
  '#6366f1',
  '#0ea5e9',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#8b5cf6',
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
    toneClassName: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  student_loan: {
    label: 'Student Loan',
    icon: GraduationCap,
    toneClassName: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  personal_loan: {
    label: 'Personal Loan',
    icon: User,
    toneClassName: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  credit_card: {
    label: 'Credit Card',
    icon: CreditCard,
    toneClassName: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  overdraft: {
    label: 'Overdraft',
    icon: AlertTriangle,
    toneClassName: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  other: {
    label: 'Other',
    icon: MoreHorizontal,
    toneClassName: 'bg-slate-100 text-slate-700 border-slate-200',
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

import { CATEGORY_COLORS, DATA_COLORS } from '@/lib/dataColors';
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

export const DEBT_COLORS = CATEGORY_COLORS;

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
  }
> = {
  car_loan: {
    label: 'Car loan',
    icon: Car,
  },
  student_loan: {
    label: 'Student loan',
    icon: GraduationCap,
  },
  personal_loan: {
    label: 'Personal loan',
    icon: User,
  },
  credit_card: {
    label: 'Credit card',
    icon: CreditCard,
  },
  overdraft: {
    label: 'Overdraft',
    icon: AlertTriangle,
  },
  other: {
    label: 'Other',
    icon: MoreHorizontal,
  },
};

export const FILTER_OPTIONS: Array<{ key: DebtFilterValue; label: string; icon: ElementType }> = [
  { key: 'all', label: 'All', icon: Banknote },
  { key: 'car_loan', label: 'Car', icon: Car },
  { key: 'student_loan', label: 'Student', icon: GraduationCap },
  { key: 'credit_card', label: 'Credit card', icon: CreditCard },
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
  color: DATA_COLORS['primary'],
  emoji: DEFAULT_EMOJI_BY_TYPE.car_loan,
  notes: '',
};

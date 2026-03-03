import { ArrowDownLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import type { TxnTypeMeta } from '@/components/ui';
import type { TxnType } from './types';

export const TXN_META: Record<
  TxnType,
  { label: string; icon: typeof ArrowDownLeft; color: string; bg: string; sign: string }
> = {
  deposit: {
    label: 'Deposit',
    icon: ArrowDownLeft,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    sign: '+',
  },
  interest: {
    label: 'Interest',
    icon: Sparkles,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    sign: '+',
  },
  withdrawal: {
    label: 'Withdrawal',
    icon: ArrowUpRight,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    sign: '\u2212',
  },
};

export const TXN_TYPE_LIST: TxnTypeMeta[] = [
  {
    key: 'deposit',
    label: 'Deposit',
    icon: ArrowDownLeft,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
  },
  {
    key: 'interest',
    label: 'Interest',
    icon: Sparkles,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
  },
  {
    key: 'withdrawal',
    label: 'Withdrawal',
    icon: ArrowUpRight,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    borderColor: 'border-rose-300',
  },
];

export const MONTH_PREFIXES: { label: string; prefix: string }[] = [
  { label: 'Aug', prefix: '2025-08' },
  { label: 'Sep', prefix: '2025-09' },
  { label: 'Oct', prefix: '2025-10' },
  { label: 'Nov', prefix: '2025-11' },
  { label: 'Dec', prefix: '2025-12' },
  { label: 'Jan', prefix: '2026-01' },
  { label: 'Feb', prefix: '2026-02' },
];

export const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'interest', label: 'Interest' },
  { key: 'withdrawal', label: 'Withdrawals' },
];

import { ArrowDownLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import type { TxnTypeMeta } from '@/components/ui';
import type { TxnType } from './types';

// Money in takes the gain colour and money out the muted figure colour, like the amounts.
export const TXN_META: Record<
  TxnType,
  { label: string; icon: typeof ArrowDownLeft; color: string }
> = {
  deposit: { label: 'Deposit', icon: ArrowDownLeft, color: 'text-gain' },
  interest: { label: 'Interest', icon: Sparkles, color: 'text-gain' },
  withdrawal: { label: 'Withdrawal', icon: ArrowUpRight, color: 'text-fg-muted' },
};

export const TXN_TYPE_LIST: TxnTypeMeta[] = (['deposit', 'interest', 'withdrawal'] as const).map(
  (key) => ({ key, ...TXN_META[key] }),
);

export const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'deposit', label: 'Deposits' },
  { key: 'interest', label: 'Interest' },
  { key: 'withdrawal', label: 'Withdrawals' },
];

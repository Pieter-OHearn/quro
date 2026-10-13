import { CircleMinus, DollarSign, Home, Landmark, ShoppingCart, Sparkles, Tag } from 'lucide-react';
import type { TxnTypeMeta } from '@/components/ui';
import type { PropertyTxnType, HoldingTxnType } from './utils/position';

// Icon colours follow the amounts: money in takes the gain colour, money out and valuations the
// muted figure colour.
export const PROPERTY_TXN_META: Record<PropertyTxnType, TxnTypeMeta> = {
  repayment: { key: 'repayment', label: 'Repayment', icon: Landmark, color: 'text-fg-muted' },
  valuation: { key: 'valuation', label: 'Valuation', icon: Home, color: 'text-fg-muted' },
  rent_income: { key: 'rent_income', label: 'Rent income', icon: DollarSign, color: 'text-gain' },
  expense: { key: 'expense', label: 'Expense', icon: CircleMinus, color: 'text-fg-muted' },
};

export const HOLDING_TXN_META: Record<HoldingTxnType, TxnTypeMeta> = {
  buy: { key: 'buy', label: 'Buy', icon: ShoppingCart, color: 'text-fg-muted' },
  sell: { key: 'sell', label: 'Sell', icon: Tag, color: 'text-gain' },
  dividend: { key: 'dividend', label: 'Dividend', icon: Sparkles, color: 'text-gain' },
};

export const PROPERTY_TXN_FORM: Record<
  PropertyTxnType,
  { amountLabel: string; notePlaceholder: string }
> = {
  repayment: {
    amountLabel: 'Total repayment amount',
    notePlaceholder: 'e.g. Monthly repayment',
  },
  valuation: {
    amountLabel: 'New estimated value',
    notePlaceholder: 'e.g. Monthly repayment',
  },
  rent_income: {
    amountLabel: 'Rent received',
    notePlaceholder: 'e.g. Monthly rent',
  },
  expense: {
    amountLabel: 'Property expense',
    notePlaceholder: 'e.g. Repair invoice',
  },
};

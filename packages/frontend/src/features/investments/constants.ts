import { CircleMinus, DollarSign, Home, Landmark, ShoppingCart, Sparkles, Tag } from 'lucide-react';
import type { TxnTypeMeta } from '@/components/ui';
import type { PropertyTxnType, HoldingTxnType } from './utils/position';

export const PROPERTY_TXN_META: Record<PropertyTxnType, TxnTypeMeta> = {
  repayment: {
    key: 'repayment',
    label: 'Repayment',
    icon: Landmark,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
  },
  valuation: {
    key: 'valuation',
    label: 'Valuation',
    icon: Home,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
  },
  rent_income: {
    key: 'rent_income',
    label: 'Rent Income',
    icon: DollarSign,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    borderColor: 'border-sky-300',
  },
  expense: {
    key: 'expense',
    label: 'Expense',
    icon: CircleMinus,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    borderColor: 'border-rose-300',
  },
};

export const HOLDING_TXN_META: Record<HoldingTxnType, TxnTypeMeta & { sign: string }> = {
  buy: {
    key: 'buy',
    label: 'Buy',
    icon: ShoppingCart,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    sign: '-',
  },
  sell: {
    key: 'sell',
    label: 'Sell',
    icon: Tag,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    borderColor: 'border-rose-300',
    sign: '+',
  },
  dividend: {
    key: 'dividend',
    label: 'Dividend',
    icon: Sparkles,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
    sign: '+',
  },
};

export const PROPERTY_TXN_FORM: Record<
  PropertyTxnType,
  { previewClass: string; amountLabel: string; notePlaceholder: string }
> = {
  repayment: {
    previewClass: 'bg-indigo-50 border-indigo-100',
    amountLabel: 'Total Repayment Amount',
    notePlaceholder: 'e.g. Monthly repayment',
  },
  valuation: {
    previewClass: 'bg-emerald-50 border-emerald-100',
    amountLabel: 'New Estimated Value',
    notePlaceholder: 'e.g. Monthly repayment',
  },
  rent_income: {
    previewClass: 'bg-sky-50 border-sky-100',
    amountLabel: 'Rent Received',
    notePlaceholder: 'e.g. Monthly rent',
  },
  expense: {
    previewClass: 'bg-rose-50 border-rose-100',
    amountLabel: 'Property Expense',
    notePlaceholder: 'e.g. Repair invoice',
  },
};

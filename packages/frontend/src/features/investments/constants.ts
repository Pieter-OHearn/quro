import { CircleMinus, DollarSign, Home, Landmark, ShoppingCart, Sparkles, Tag } from 'lucide-react';
import type { TxnTypeMeta } from '@/components/ui';
import type { PropertyTxnType, HoldingTxnType } from './utils/position';

export const PROPERTY_TXN_META: Record<PropertyTxnType, TxnTypeMeta> = {
  repayment: {
    key: 'repayment',
    label: 'Repayment',
    icon: Landmark,
    color: 'text-brand',
    bg: 'bg-brand-soft',
    borderColor: 'border-brand-border',
  },
  valuation: {
    key: 'valuation',
    label: 'Valuation',
    icon: Home,
    color: 'text-success',
    bg: 'bg-success-soft',
    borderColor: 'border-success-border-strong',
  },
  rent_income: {
    key: 'rent_income',
    label: 'Rent Income',
    icon: DollarSign,
    color: 'text-info',
    bg: 'bg-info-soft',
    borderColor: 'border-info-border-strong',
  },
  expense: {
    key: 'expense',
    label: 'Expense',
    icon: CircleMinus,
    color: 'text-danger',
    bg: 'bg-danger-soft',
    borderColor: 'border-danger-border-strong',
  },
};

export const HOLDING_TXN_META: Record<HoldingTxnType, TxnTypeMeta & { sign: string }> = {
  buy: {
    key: 'buy',
    label: 'Buy',
    icon: ShoppingCart,
    color: 'text-success',
    bg: 'bg-success-soft',
    borderColor: 'border-success-border-strong',
    sign: '-',
  },
  sell: {
    key: 'sell',
    label: 'Sell',
    icon: Tag,
    color: 'text-danger',
    bg: 'bg-danger-soft',
    borderColor: 'border-danger-border-strong',
    sign: '+',
  },
  dividend: {
    key: 'dividend',
    label: 'Dividend',
    icon: Sparkles,
    color: 'text-brand',
    bg: 'bg-brand-soft',
    borderColor: 'border-brand-border',
    sign: '+',
  },
};

export const PROPERTY_TXN_FORM: Record<
  PropertyTxnType,
  { previewClass: string; amountLabel: string; notePlaceholder: string }
> = {
  repayment: {
    previewClass: 'bg-brand-soft border-brand-soft-strong',
    amountLabel: 'Total Repayment Amount',
    notePlaceholder: 'e.g. Monthly repayment',
  },
  valuation: {
    previewClass: 'bg-success-soft border-success-soft-strong',
    amountLabel: 'New Estimated Value',
    notePlaceholder: 'e.g. Monthly repayment',
  },
  rent_income: {
    previewClass: 'bg-info-soft border-info-soft-strong',
    amountLabel: 'Rent Received',
    notePlaceholder: 'e.g. Monthly rent',
  },
  expense: {
    previewClass: 'bg-danger-soft border-danger-soft-strong',
    amountLabel: 'Property Expense',
    notePlaceholder: 'e.g. Repair invoice',
  },
};

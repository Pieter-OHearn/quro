import { useState } from 'react';
import { CircleMinus, DollarSign, Home, Landmark } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import type { TxnTypeMeta } from '@/components/ui';
import type { Property, PropertyTransaction } from '@quro/shared';
import { isInvestmentProperty, type PropertyTxnType } from '../utils/position';

type PropertyTxnHistoryProps = {
  property: Property;
  transactions: PropertyTransaction[];
  onAdd: () => void;
  onDelete: (id: number) => void;
};

const PROPERTY_TXN_META: Record<PropertyTxnType, TxnTypeMeta> = {
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

type PropertyTxnAmountProps = {
  transaction: PropertyTransaction;
  currency: string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function PropertyTxnAmount({ transaction, currency, fmtNative }: PropertyTxnAmountProps) {
  if (transaction.type === 'repayment') {
    return (
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-slate-700">
          -{fmtNative(transaction.amount, currency, true)}
        </p>
        <p className="text-[10px] text-slate-400">
          <span className="text-rose-400">
            {fmtNative(transaction.interest ?? 0, currency, true)} int
          </span>
          {' · '}
          <span className="text-indigo-500">
            {fmtNative(transaction.principal ?? 0, currency, true)} prin
          </span>
        </p>
      </div>
    );
  }
  if (transaction.type === 'valuation') {
    return (
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-emerald-600">
          {fmtNative(transaction.amount, currency, true)}
        </p>
        <p className="text-[10px] text-slate-400">new value</p>
      </div>
    );
  }
  if (transaction.type === 'rent_income') {
    return (
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-sky-600">
          +{fmtNative(transaction.amount, currency, true)}
        </p>
        <p className="text-[10px] text-slate-400">rent received</p>
      </div>
    );
  }
  return (
    <div className="text-right flex-shrink-0">
      <p className="text-sm font-semibold text-rose-500">
        -{fmtNative(transaction.amount, currency, true)}
      </p>
      <p className="text-[10px] text-slate-400">expense</p>
    </div>
  );
}

function buildPropertyTxnStats(
  transactions: PropertyTransaction[],
  currency: string,
  supportsCashflowTxns: boolean,
  fmtNative: (value: number, currency: string, compact?: boolean) => string,
) {
  const totalRepaid = transactions
    .filter((t) => t.type === 'repayment')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalPrincipal = transactions
    .filter((t) => t.type === 'repayment')
    .reduce((sum, t) => sum + (t.principal ?? 0), 0);
  const totalInterest = transactions
    .filter((t) => t.type === 'repayment')
    .reduce((sum, t) => sum + (t.interest ?? 0), 0);
  const valuationCount = transactions.filter((t) => t.type === 'valuation').length;
  const totalRentIncome = transactions
    .filter((t) => t.type === 'rent_income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const base = [
    {
      label: 'Total Repaid',
      value: fmtNative(totalRepaid, currency, true),
      color: 'text-slate-800',
    },
    {
      label: 'Principal',
      value: fmtNative(totalPrincipal, currency, true),
      color: 'text-indigo-600',
    },
    {
      label: 'Interest Paid',
      value: fmtNative(totalInterest, currency, true),
      color: 'text-rose-500',
    },
    { label: 'Valuations', value: `${valuationCount}`, color: 'text-emerald-600' },
  ];
  if (!supportsCashflowTxns) return base;
  return [
    ...base,
    {
      label: 'Rent Income',
      value: `+${fmtNative(totalRentIncome, currency, true)}`,
      color: 'text-sky-600',
    },
    {
      label: 'Expenses',
      value: `-${fmtNative(totalExpenses, currency, true)}`,
      color: 'text-rose-500',
    },
  ];
}

function getFilterLabel(option: string): string {
  if (option === 'all') return 'All';
  if (option === 'rent_income') return 'Rent Income';
  return `${PROPERTY_TXN_META[option as PropertyTxnType].label}s`;
}

export function PropertyTxnHistory({
  property,
  transactions,
  onAdd,
  onDelete,
}: PropertyTxnHistoryProps) {
  const { fmtNative } = useCurrency();
  const supportsCashflowTxns = isInvestmentProperty(property.propertyType);
  const filterOptions = supportsCashflowTxns
    ? (['all', 'repayment', 'valuation', 'rent_income', 'expense'] as const)
    : (['all', 'repayment', 'valuation'] as const);
  const [filter, setFilter] = useState<PropertyTxnType | 'all'>('all');

  const sorted = [...transactions]
    .filter((transaction) => filter === 'all' || transaction.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  const stats = buildPropertyTxnStats(
    transactions,
    property.currency,
    supportsCashflowTxns,
    fmtNative,
  );

  return (
    <TxnHistoryPanel
      filterOptions={filterOptions.map((option) => ({
        key: option,
        label: getFilterLabel(option),
      }))}
      filter={filter}
      onFilterChange={(key) => setFilter(key as PropertyTxnType | 'all')}
      stats={stats}
      statsColumns={supportsCashflowTxns ? 6 : 4}
      onAdd={onAdd}
      isEmpty={sorted.length === 0}
    >
      {sorted.map((transaction) => {
        const meta = PROPERTY_TXN_META[transaction.type];
        return (
          <TxnRow
            key={transaction.id}
            icon={meta.icon}
            iconColor={meta.color}
            iconBg={meta.bg}
            label={transaction.note || meta.label}
            date={transaction.date}
            amount={
              <PropertyTxnAmount
                transaction={transaction}
                currency={property.currency}
                fmtNative={fmtNative}
              />
            }
            onDelete={() => onDelete(transaction.id)}
          />
        );
      })}
    </TxnHistoryPanel>
  );
}

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

  const totalRepaid = transactions
    .filter((transaction) => transaction.type === 'repayment')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalPrincipal = transactions
    .filter((transaction) => transaction.type === 'repayment')
    .reduce((sum, transaction) => sum + (transaction.principal ?? 0), 0);
  const totalInterest = transactions
    .filter((transaction) => transaction.type === 'repayment')
    .reduce((sum, transaction) => sum + (transaction.interest ?? 0), 0);
  const valuationCount = transactions.filter(
    (transaction) => transaction.type === 'valuation',
  ).length;
  const totalRentIncome = transactions
    .filter((transaction) => transaction.type === 'rent_income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpenses = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const stats = [
    {
      label: 'Total Repaid',
      value: fmtNative(totalRepaid, property.currency, true),
      color: 'text-slate-800',
    },
    {
      label: 'Principal',
      value: fmtNative(totalPrincipal, property.currency, true),
      color: 'text-indigo-600',
    },
    {
      label: 'Interest Paid',
      value: fmtNative(totalInterest, property.currency, true),
      color: 'text-rose-500',
    },
    { label: 'Valuations', value: `${valuationCount}`, color: 'text-emerald-600' },
    ...(supportsCashflowTxns
      ? [
          {
            label: 'Rent Income',
            value: `+${fmtNative(totalRentIncome, property.currency, true)}`,
            color: 'text-sky-600',
          },
          {
            label: 'Expenses',
            value: `-${fmtNative(totalExpenses, property.currency, true)}`,
            color: 'text-rose-500',
          },
        ]
      : []),
  ];

  return (
    <TxnHistoryPanel
      filterOptions={filterOptions.map((option) => ({
        key: option,
        label:
          option === 'all'
            ? 'All'
            : option === 'rent_income'
              ? 'Rent Income'
              : `${PROPERTY_TXN_META[option as PropertyTxnType].label}s`,
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

        const amount =
          transaction.type === 'repayment' ? (
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-slate-700">
                -{fmtNative(transaction.amount, property.currency, true)}
              </p>
              <p className="text-[10px] text-slate-400">
                <span className="text-rose-400">
                  {fmtNative(transaction.interest ?? 0, property.currency, true)} int
                </span>
                {' · '}
                <span className="text-indigo-500">
                  {fmtNative(transaction.principal ?? 0, property.currency, true)} prin
                </span>
              </p>
            </div>
          ) : transaction.type === 'valuation' ? (
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-emerald-600">
                {fmtNative(transaction.amount, property.currency, true)}
              </p>
              <p className="text-[10px] text-slate-400">new value</p>
            </div>
          ) : transaction.type === 'rent_income' ? (
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-sky-600">
                +{fmtNative(transaction.amount, property.currency, true)}
              </p>
              <p className="text-[10px] text-slate-400">rent received</p>
            </div>
          ) : (
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-rose-500">
                -{fmtNative(transaction.amount, property.currency, true)}
              </p>
              <p className="text-[10px] text-slate-400">expense</p>
            </div>
          );

        return (
          <TxnRow
            key={transaction.id}
            icon={meta.icon}
            iconColor={meta.color}
            iconBg={meta.bg}
            label={transaction.note || meta.label}
            date={transaction.date}
            amount={amount}
            onDelete={() => onDelete(transaction.id)}
          />
        );
      })}
    </TxnHistoryPanel>
  );
}

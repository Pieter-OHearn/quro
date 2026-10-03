import { PROPERTY_TXN_META } from '../constants';
import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import type { Property, PropertyTransaction } from '@quro/shared';
import { isInvestmentProperty, type PropertyTxnType } from '../utils/position';

type PropertyTxnHistoryProps = {
  property: Property;
  transactions: PropertyTransaction[];
  onAdd: () => void;
  onEdit: (transaction: PropertyTransaction) => void;
  onDelete: (id: number) => void;
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
        <p className="text-sm font-semibold text-fg-strong">
          -{fmtNative(transaction.amount, currency, true)}
        </p>
        <p className="text-[10px] text-fg-faint">
          <span className="text-danger-muted">
            {fmtNative(transaction.interest ?? 0, currency, true)} int
          </span>
          {' · '}
          <span className="text-brand-accent">
            {fmtNative(transaction.principal ?? 0, currency, true)} prin
          </span>
        </p>
      </div>
    );
  }
  if (transaction.type === 'valuation') {
    return (
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-success">
          {fmtNative(transaction.amount, currency, true)}
        </p>
        <p className="text-[10px] text-fg-faint">new value</p>
      </div>
    );
  }
  if (transaction.type === 'rent_income') {
    return (
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-info">
          +{fmtNative(transaction.amount, currency, true)}
        </p>
        <p className="text-[10px] text-fg-faint">rent received</p>
      </div>
    );
  }
  return (
    <div className="text-right flex-shrink-0">
      <p className="text-sm font-semibold text-danger">
        -{fmtNative(transaction.amount, currency, true)}
      </p>
      <p className="text-[10px] text-fg-faint">expense</p>
    </div>
  );
}

type FmtNativeFn = (value: number, currency: string, compact?: boolean) => string;

function buildCashflowTxnStats(
  transactions: PropertyTransaction[],
  currency: string,
  fmtNative: FmtNativeFn,
) {
  const totalRentIncome = transactions
    .filter((t) => t.type === 'rent_income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  return [
    {
      label: 'Rent Income',
      value: `+${fmtNative(totalRentIncome, currency, true)}`,
      color: 'text-info',
    },
    {
      label: 'Expenses',
      value: `-${fmtNative(totalExpenses, currency, true)}`,
      color: 'text-danger',
    },
  ];
}

function buildPropertyTxnStats(
  transactions: PropertyTransaction[],
  currency: string,
  supportsCashflowTxns: boolean,
  fmtNative: FmtNativeFn,
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
  const base = [
    {
      label: 'Total Repaid',
      value: fmtNative(totalRepaid, currency, true),
      color: 'text-fg-emphasis',
    },
    {
      label: 'Principal',
      value: fmtNative(totalPrincipal, currency, true),
      color: 'text-brand',
    },
    {
      label: 'Interest Paid',
      value: fmtNative(totalInterest, currency, true),
      color: 'text-danger',
    },
    { label: 'Valuations', value: `${valuationCount}`, color: 'text-success' },
  ];
  if (!supportsCashflowTxns) return base;
  return [...base, ...buildCashflowTxnStats(transactions, currency, fmtNative)];
}

function getFilterLabel(option: string): string {
  if (option === 'all') return 'All';
  if (option === 'rent_income') return 'Rent Income';
  return `${PROPERTY_TXN_META[option as PropertyTxnType].label}s`;
}

function getPropertyFilterOptions(supportsCashflowTxns: boolean) {
  return supportsCashflowTxns
    ? (['all', 'repayment', 'valuation', 'rent_income', 'expense'] as const)
    : (['all', 'repayment', 'valuation'] as const);
}

function sortPropertyTxns(transactions: PropertyTransaction[], filter: PropertyTxnType | 'all') {
  return [...transactions]
    .filter((t) => filter === 'all' || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date));
}

type PropertyTxnRowProps = {
  transaction: PropertyTransaction;
  property: Property;
  fmtNative: (v: number, c: string) => string;
  onEdit: (transaction: PropertyTransaction) => void;
  onDelete: (id: number) => void;
};

function PropertyTxnRow({
  transaction,
  property,
  fmtNative,
  onEdit,
  onDelete,
}: PropertyTxnRowProps) {
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
      onEdit={() => onEdit(transaction)}
      onDelete={() => onDelete(transaction.id)}
    />
  );
}

export function PropertyTxnHistory(props: PropertyTxnHistoryProps) {
  const { property, transactions, onAdd, onEdit, onDelete } = props;
  const { fmtNative } = useCurrency();
  const supportsCashflowTxns = isInvestmentProperty(property.propertyType);
  const filterOptions = getPropertyFilterOptions(supportsCashflowTxns);
  const [filter, setFilter] = useState<PropertyTxnType | 'all'>('all');
  const sorted = sortPropertyTxns(transactions, filter);
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
      {sorted.map((t) => (
        <PropertyTxnRow
          key={t.id}
          transaction={t}
          property={property}
          fmtNative={fmtNative}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </TxnHistoryPanel>
  );
}

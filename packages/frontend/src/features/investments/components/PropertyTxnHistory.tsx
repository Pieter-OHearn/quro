import { PROPERTY_TXN_META } from '../constants';
import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import { TxnAmount } from '@/components/finance/TxnAmount';
import type { Property, PropertyTransaction } from '@quro/shared';
import { isInvestmentProperty, type PropertyTxnType } from '../utils/position';

type PropertyTxnHistoryProps = {
  property: Property;
  transactions: PropertyTransaction[];
  onAdd: () => void;
  onEdit: (transaction: PropertyTransaction) => void;
  onDelete: (id: number) => void;
};

type FmtNativeFn = (value: number, currency: string, compact?: boolean) => string;

/** Rent moves money in, repayments and expenses move it out; a valuation is not a cash flow. */
function PropertyTxnAmount({
  transaction,
  currency,
  fmtNative,
}: Readonly<{ transaction: PropertyTransaction; currency: string; fmtNative: FmtNativeFn }>) {
  const format = (amount: number) => fmtNative(amount, currency, true);
  if (transaction.type === 'valuation') {
    return <span className="text-fg">{format(transaction.amount)}</span>;
  }
  const signed = transaction.type === 'rent_income' ? transaction.amount : -transaction.amount;
  return <TxnAmount value={signed} format={format} />;
}

function describePropertyTxn(transaction: PropertyTransaction, fmt: (v: number) => string) {
  const label = transaction.note || PROPERTY_TXN_META[transaction.type].label;
  if (transaction.type !== 'repayment') return label;
  return `${label} · ${fmt(transaction.interest ?? 0)} int · ${fmt(transaction.principal ?? 0)} prin`;
}

function sumAmounts(transactions: PropertyTransaction[], type: PropertyTxnType): number {
  return transactions.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount, 0);
}

function buildCashflowTxnStats(
  transactions: PropertyTransaction[],
  currency: string,
  fmtNative: FmtNativeFn,
) {
  const format = (amount: number) => fmtNative(amount, currency, true);
  return [
    {
      label: 'Rent income',
      value: <TxnAmount value={sumAmounts(transactions, 'rent_income')} format={format} />,
    },
    {
      label: 'Expenses',
      value: <TxnAmount value={-sumAmounts(transactions, 'expense')} format={format} />,
    },
  ];
}

function buildPropertyTxnStats(
  transactions: PropertyTransaction[],
  currency: string,
  supportsCashflowTxns: boolean,
  fmtNative: FmtNativeFn,
) {
  const repayments = transactions.filter((t) => t.type === 'repayment');
  const totalPrincipal = repayments.reduce((sum, t) => sum + (t.principal ?? 0), 0);
  const totalInterest = repayments.reduce((sum, t) => sum + (t.interest ?? 0), 0);
  const valuationCount = transactions.filter((t) => t.type === 'valuation').length;
  const base = [
    {
      label: 'Total repaid',
      value: fmtNative(sumAmounts(transactions, 'repayment'), currency, true),
    },
    { label: 'Principal', value: fmtNative(totalPrincipal, currency, true) },
    { label: 'Interest paid', value: fmtNative(totalInterest, currency, true) },
    { label: 'Valuations', value: `${valuationCount}` },
  ];
  if (!supportsCashflowTxns) return base;
  return [...base, ...buildCashflowTxnStats(transactions, currency, fmtNative)];
}

function getFilterLabel(option: string): string {
  if (option === 'all') return 'All';
  if (option === 'rent_income') return 'Rent income';
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
  fmtNative: FmtNativeFn;
  onEdit: (transaction: PropertyTransaction) => void;
  onDelete: (id: number) => void;
};

function PropertyTxnRow({
  transaction,
  property,
  fmtNative,
  onEdit,
  onDelete,
}: Readonly<PropertyTxnRowProps>) {
  const meta = PROPERTY_TXN_META[transaction.type];
  return (
    <TxnRow
      icon={meta.icon}
      iconColor={meta.color}
      label={describePropertyTxn(transaction, (amount) =>
        fmtNative(amount, property.currency, true),
      )}
      date={transaction.date}
      badge={transaction.note ? { text: meta.label, className: 'max-sm:hidden' } : undefined}
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
      addLabel="Add transaction"
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

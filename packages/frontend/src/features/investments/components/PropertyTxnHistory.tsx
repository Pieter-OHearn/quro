import { PROPERTY_TXN_META } from '../constants';
import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import { TxnAmount } from '@/components/finance/TxnAmount';
import { LedgerOwnerLink } from '@/components/finance/LedgerOwnerLink';
import {
  sumMoney,
  type MortgageTransaction,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';
import { TXN_META as MORTGAGE_TXN_META } from '@/features/mortgage/utils/mortgage-meta';
import { isInvestmentProperty, type PropertyTxnType } from '../utils/position';

type PropertyTxnHistoryProps = {
  property: Property;
  transactions: PropertyTransaction[];
  /** The linked mortgage's ledger, shown read-only: its repayments and rate changes. */
  mortgageTransactions: MortgageTransaction[];
  onAdd: () => void;
  onEdit: (transaction: PropertyTransaction) => void;
  onDelete: (id: number) => void;
};

type FmtNativeFn = (value: number, currency: string, compact?: boolean) => string;

type HistoryFilter = PropertyTxnType | 'repayment' | 'all';

type HistoryRow =
  | { ledger: 'property'; transaction: PropertyTransaction }
  | { ledger: 'mortgage'; transaction: MortgageTransaction };

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

function MortgageRowAmount({
  transaction,
  currency,
  fmtNative,
}: Readonly<{ transaction: MortgageTransaction; currency: string; fmtNative: FmtNativeFn }>) {
  if (transaction.type === 'rate_change') {
    return <span className="text-fg">{`${transaction.amount}%`}</span>;
  }
  return (
    <TxnAmount value={-transaction.amount} format={(amount) => fmtNative(amount, currency, true)} />
  );
}

function describeMortgageRow(transaction: MortgageTransaction, fmt: (v: number) => string) {
  const label = transaction.note || MORTGAGE_TXN_META[transaction.type].label;
  if (transaction.type !== 'repayment') return label;
  return `${label} · ${fmt(transaction.interest ?? 0)} int · ${fmt(transaction.principal ?? 0)} prin`;
}

function sumAmounts(transactions: PropertyTransaction[], type: PropertyTxnType): number {
  return sumMoney(transactions.filter((t) => t.type === type).map((t) => t.amount));
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

// Repayment totals come from the mortgage's ledger, which owns the repayments.
function buildPropertyTxnStats(
  transactions: PropertyTransaction[],
  mortgageTransactions: MortgageTransaction[],
  currency: string,
  supportsCashflowTxns: boolean,
  fmtNative: FmtNativeFn,
) {
  const repayments = mortgageTransactions.filter((t) => t.type === 'repayment');
  const valuationCount = transactions.filter((t) => t.type === 'valuation').length;
  const base = [
    {
      label: 'Total repaid',
      value: fmtNative(sumMoney(repayments.map((t) => t.amount)), currency, true),
    },
    {
      label: 'Principal',
      value: fmtNative(sumMoney(repayments.map((t) => t.principal ?? 0)), currency, true),
    },
    {
      label: 'Interest paid',
      value: fmtNative(sumMoney(repayments.map((t) => t.interest ?? 0)), currency, true),
    },
    { label: 'Valuations', value: `${valuationCount}` },
  ];
  if (!supportsCashflowTxns) return base;
  return [...base, ...buildCashflowTxnStats(transactions, currency, fmtNative)];
}

function getFilterLabel(option: HistoryFilter): string {
  if (option === 'all') return 'All';
  if (option === 'rent_income') return 'Rent income';
  if (option === 'repayment') return 'Repayments';
  return `${PROPERTY_TXN_META[option].label}s`;
}

function getPropertyFilterOptions(
  supportsCashflowTxns: boolean,
  hasMortgageRows: boolean,
): HistoryFilter[] {
  return [
    'all',
    ...(hasMortgageRows ? (['repayment'] as const) : []),
    'valuation',
    ...(supportsCashflowTxns ? (['rent_income', 'expense'] as const) : []),
  ];
}

function sortHistoryRows(rows: HistoryRow[], filter: HistoryFilter) {
  return rows
    .filter((row) => filter === 'all' || row.transaction.type === filter)
    .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
}

type HistoryRowProps = {
  row: HistoryRow;
  property: Property;
  fmtNative: FmtNativeFn;
  onEdit: (transaction: PropertyTransaction) => void;
  onDelete: (id: number) => void;
};

function PropertyHistoryRow({
  row,
  property,
  fmtNative,
  onEdit,
  onDelete,
}: Readonly<HistoryRowProps>) {
  if (row.ledger === 'mortgage') {
    const { transaction } = row;
    const meta = MORTGAGE_TXN_META[transaction.type];
    return (
      <TxnRow
        icon={meta.icon}
        iconColor="text-fg-muted"
        label={describeMortgageRow(transaction, (amount) =>
          fmtNative(amount, property.currency, true),
        )}
        date={transaction.date}
        badge={{ text: 'Mortgage', className: 'max-sm:hidden' }}
        amount={
          <MortgageRowAmount
            transaction={transaction}
            currency={property.currency}
            fmtNative={fmtNative}
          />
        }
        readOnlyAction={
          <LedgerOwnerLink to={`/mortgage?mortgageId=${transaction.mortgageId}`} page="Mortgage" />
        }
      />
    );
  }
  const { transaction } = row;
  const meta = PROPERTY_TXN_META[transaction.type];
  return (
    <TxnRow
      icon={meta.icon}
      iconColor={meta.color}
      label={transaction.note || meta.label}
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
  const { property, transactions, mortgageTransactions, onAdd, onEdit, onDelete } = props;
  const { fmtNative } = useCurrency();
  const supportsCashflowTxns = isInvestmentProperty(property.propertyType);
  const filterOptions = getPropertyFilterOptions(
    supportsCashflowTxns,
    mortgageTransactions.length > 0,
  );
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const rows: HistoryRow[] = [
    ...transactions.map((transaction) => ({ ledger: 'property' as const, transaction })),
    ...mortgageTransactions.map((transaction) => ({ ledger: 'mortgage' as const, transaction })),
  ];
  const sorted = sortHistoryRows(rows, filter);
  const stats = buildPropertyTxnStats(
    transactions,
    mortgageTransactions,
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
      onFilterChange={(key) => setFilter(key as HistoryFilter)}
      stats={stats}
      statsColumns={supportsCashflowTxns ? 6 : 4}
      onAdd={onAdd}
      addLabel="Add transaction"
      isEmpty={sorted.length === 0}
    >
      {sorted.map((row) => (
        <PropertyHistoryRow
          key={`${row.ledger}-${row.transaction.id}`}
          row={row}
          property={property}
          fmtNative={fmtNative}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </TxnHistoryPanel>
  );
}

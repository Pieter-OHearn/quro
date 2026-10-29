import { useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import { TxnHistoryPanel, TxnRow } from '@/components/ui';
import { LedgerOwnerLink } from '@/components/finance/LedgerOwnerLink';
import type {
  Mortgage as MortgageType,
  MortgageTransaction,
  PropertyTransaction,
} from '@quro/shared';
import { PROPERTY_TXN_META } from '@/features/investments/constants';
import type { MortgageTxnType } from '../types';
import { formatAsNegative } from '@/lib/liability';
import { MORTGAGE_TXN_FILTER_OPTIONS, TXN_META } from '../utils/mortgage-meta';

type MortgageTxnHistoryProps = {
  mortgage: MortgageType;
  currency?: string;
  transactions: MortgageTransaction[];
  /** The linked property's valuations, shown read-only: the property's ledger owns them. */
  propertyValuations: PropertyTransaction[];
  onAdd: () => void;
  onEdit: (transaction: MortgageTransaction) => void;
  onDelete: (id: number) => void;
};

type MortgageTxnRowProps = {
  t: MortgageTransaction;
  fmt: (n: number) => string;
  onEdit: (transaction: MortgageTransaction) => void;
  onDelete: (id: number) => void;
};
function describeMortgageTxn(t: MortgageTransaction, fmt: (n: number) => string) {
  if (t.type === 'repayment') {
    return {
      amount: formatAsNegative(fmt, t.amount),
      details: [`${fmt(t.interest ?? 0)} int`, `${fmt(t.principal ?? 0)} prin`],
    };
  }
  return {
    amount: `${t.amount}%`,
    details: [t.fixedYears ? `fixed ${t.fixedYears}yr` : 'new rate'],
  };
}

// One line on desktop with the details before the amount. Below 640px the details sit under the
// amount, one per line, so the label keeps its width.
function MortgageTxnAmount({ t, fmt }: Pick<MortgageTxnRowProps, 't' | 'fmt'>) {
  const { amount, details } = describeMortgageTxn(t, fmt);
  return (
    <span className="flex items-baseline justify-end gap-2 max-sm:flex-col max-sm:items-end max-sm:gap-0">
      <span className="text-caption text-fg-subtle max-sm:order-last max-sm:leading-4">
        {details.map((detail, index) => (
          <span key={detail} className="max-sm:block">
            {index > 0 ? <span className="max-sm:hidden"> · </span> : null}
            {detail}
          </span>
        ))}
      </span>
      <span className="text-cell text-fg">{amount}</span>
    </span>
  );
}

function MortgageTxnRow({ t, fmt, onEdit, onDelete }: MortgageTxnRowProps) {
  const m = TXN_META[t.type];
  return (
    <TxnRow
      icon={m.icon}
      iconColor="text-fg-muted"
      iconBg={m.bg}
      iconContainerClassName="max-sm:hidden"
      label={t.note || m.label}
      date={t.date}
      amount={<MortgageTxnAmount t={t} fmt={fmt} />}
      onEdit={() => onEdit(t)}
      onDelete={() => onDelete(t.id)}
    />
  );
}

function PropertyValuationRow({
  valuation,
  fmt,
}: Readonly<{ valuation: PropertyTransaction; fmt: (n: number) => string }>) {
  const meta = PROPERTY_TXN_META.valuation;
  return (
    <TxnRow
      icon={meta.icon}
      iconColor="text-fg-muted"
      iconContainerClassName="max-sm:hidden"
      label={valuation.note || meta.label}
      date={valuation.date}
      badge={{ text: 'Property', className: 'max-sm:hidden' }}
      amount={
        <span className="flex items-baseline justify-end gap-2 max-sm:flex-col max-sm:items-end max-sm:gap-0">
          <span className="text-caption text-fg-subtle max-sm:order-last max-sm:leading-4">
            new value
          </span>
          <span className="text-cell text-fg">{fmt(valuation.amount)}</span>
        </span>
      }
      readOnlyAction={<LedgerOwnerLink to="/investments" page="Investments" />}
    />
  );
}

type HistoryFilter = MortgageTxnType | 'valuation' | 'all';

type HistoryRow =
  | { ledger: 'mortgage'; transaction: MortgageTransaction }
  | { ledger: 'property'; transaction: PropertyTransaction };

type MortgageSummaryStatsProps = {
  transactions: MortgageTransaction[];
  fmt: (n: number) => string;
};
function buildMortgageTxnStats({ transactions, fmt }: MortgageSummaryStatsProps) {
  const repayments = transactions.filter((t) => t.type === 'repayment');
  const totalRepaid = repayments.reduce((s, t) => s + t.amount, 0);
  const totalPrincipal = repayments.reduce((s, t) => s + (t.principal ?? 0), 0);
  const totalInterest = repayments.reduce((s, t) => s + (t.interest ?? 0), 0);
  const rateChanges = transactions.filter((t) => t.type === 'rate_change').length;
  return [
    { label: 'Total repaid', value: fmt(totalRepaid) },
    { label: 'Principal paid', value: fmt(totalPrincipal) },
    { label: 'Interest paid', value: fmt(totalInterest) },
    { label: 'Rate changes', value: String(rateChanges) },
  ];
}

function filterLabel(option: HistoryFilter): string {
  if (option === 'all') return 'All';
  if (option === 'valuation') return 'Valuations';
  return `${TXN_META[option].label}s`;
}

export function MortgageTxnHistory({
  mortgage: _mortgage,
  currency,
  transactions,
  propertyValuations,
  onAdd,
  onEdit,
  onDelete,
}: MortgageTxnHistoryProps) {
  const { fmtBase } = useCurrency();
  const fmt = (n: number) => fmtBase(n, currency);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const rows: HistoryRow[] = [
    ...transactions.map((transaction) => ({ ledger: 'mortgage' as const, transaction })),
    ...propertyValuations.map((transaction) => ({ ledger: 'property' as const, transaction })),
  ];
  const sorted = rows
    .filter((row) => filter === 'all' || row.transaction.type === filter)
    .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
  const filterOptions: HistoryFilter[] = [
    ...MORTGAGE_TXN_FILTER_OPTIONS,
    ...(propertyValuations.length > 0 ? (['valuation'] as const) : []),
  ];

  return (
    <TxnHistoryPanel
      title="Transaction history"
      subtitle={`${rows.length} transactions recorded`}
      variant="card"
      addButtonPlacement="header"
      filterOptions={filterOptions.map((option) => ({
        key: option,
        label: filterLabel(option),
      }))}
      filter={filter}
      onFilterChange={(key) => setFilter(key as HistoryFilter)}
      stats={buildMortgageTxnStats({ transactions, fmt })}
      statsColumns={4}
      onAdd={onAdd}
      addLabel="Record transaction"
      isEmpty={sorted.length === 0}
    >
      {sorted.map((row) =>
        row.ledger === 'mortgage' ? (
          <MortgageTxnRow
            key={`mortgage-${row.transaction.id}`}
            t={row.transaction}
            fmt={fmt}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <PropertyValuationRow
            key={`property-${row.transaction.id}`}
            valuation={row.transaction}
            fmt={fmt}
          />
        ),
      )}
    </TxnHistoryPanel>
  );
}

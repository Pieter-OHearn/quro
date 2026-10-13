import { Link } from 'react-router';
import { DataTable, DataTableCell, DataTableRow, type DataTableColumn } from '@/components/ui';
import { JointBadge } from '@/features/partner';
import { cn, formatDate } from '@/lib/utils';
import type { DashboardFormatFn, DashboardTransaction } from '../types';

const MINUS_SIGN = '−';
// Transaction dates are calendar dates: format them in UTC so they never shift a day.
const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
};

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'date', header: 'Date', priority: 'secondary', width: 104, numeric: true, align: 'left' },
  { key: 'name', header: 'Transaction', mobileLabel: '' },
  { key: 'category', header: 'Category', priority: 'secondary' },
  { key: 'amount', header: 'Amount', numeric: true },
];

/** Money in is a gain with a plus sign; money out keeps the figure colour with a true minus. */
function TransactionAmount({
  amount,
  fmtBase,
}: Readonly<{ amount: number; fmtBase: DashboardFormatFn }>) {
  const sign = amount > 0 ? '+' : amount < 0 ? MINUS_SIGN : '';
  return (
    <span className={cn('whitespace-nowrap', amount > 0 ? 'text-gain' : 'text-fg')}>
      {sign}
      {fmtBase(Math.abs(amount), undefined, true)}
    </span>
  );
}

function TransactionRow({
  tx,
  fmtBase,
}: Readonly<{ tx: DashboardTransaction; fmtBase: DashboardFormatFn }>) {
  const date = formatDate(tx.date, DATE_OPTIONS);
  return (
    <DataTableRow>
      <DataTableCell columnKey="date" className="whitespace-nowrap text-fg-muted">
        {date}
      </DataTableCell>
      <DataTableCell columnKey="name" contentClassName="max-md:w-full">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-fg">{tx.name}</span>
          <JointBadge isJoint={tx.isJoint} size="xs" />
        </div>
        <p className="text-caption text-fg-subtle md:hidden">
          {tx.category} · {date}
        </p>
      </DataTableCell>
      <DataTableCell columnKey="category" className="text-fg-muted">
        {tx.category}
      </DataTableCell>
      <DataTableCell columnKey="amount">
        <TransactionAmount amount={tx.amount} fmtBase={fmtBase} />
      </DataTableCell>
    </DataTableRow>
  );
}

export function RecentTransactionsCard({
  transactions,
  baseCurrency,
  fmtBase,
}: Readonly<{
  transactions: readonly DashboardTransaction[];
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <DataTable
      title="Recent transactions"
      subtitle={`This month in ${baseCurrency}`}
      action={
        <Link
          to="/budget"
          className="rounded-sm text-cell font-medium text-brand transition-colors duration-fast hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring max-sm:inline-flex max-sm:min-h-11 max-sm:items-center"
        >
          View all
        </Link>
      }
      columns={COLUMNS}
      density="compact"
      tableVariant="financial"
      isEmpty={transactions.length === 0}
      emptyState="No transactions yet."
    >
      {transactions.map((tx) => (
        <TransactionRow key={tx.id} tx={tx} fmtBase={fmtBase} />
      ))}
    </DataTable>
  );
}

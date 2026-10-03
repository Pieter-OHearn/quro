import { useSortedRows, newestFirst } from '@/hooks/useSortedRows';
import { useState } from 'react';
import { type Debt, type DebtPayment } from '@quro/shared';
import { Clock, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  type DataTableSortState,
  type DataTableColumn,
} from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatDate } from '@/lib/utils';

type PaymentHistoryProps = {
  debt: Debt;
  payments: readonly DebtPayment[];
  onLogPayment: () => void;
  onDeletePayment: (id: number) => void;
};

type PaymentHistoryTableProps = Omit<PaymentHistoryProps, 'onLogPayment' | 'payments'> & {
  sortedPayments: DebtPayment[];
  sort: DataTableSortState;
  onSortChange: (sort: DataTableSortState) => void;
};

const PAYMENT_COLUMNS: readonly DataTableColumn<DebtPayment>[] = [
  {
    key: 'date',
    sortValue: (row) => row.date,
    header: 'Date',
    mobileLabel: 'Date',
    sortable: true,
    defaultSortDirection: 'desc',
  },
  {
    key: 'amount',
    sortValue: (row) => row.amount,
    header: 'Amount',
    align: 'right',
    mobileLabel: 'Amount',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'font-semibold text-fg-emphasis',
  },
  {
    key: 'principal',
    sortValue: (row) => row.principal,
    header: 'Principal',
    align: 'right',
    mobileLabel: 'Principal',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'font-medium text-success',
  },
  {
    key: 'interest',
    sortValue: (row) => row.interest,
    header: 'Interest',
    align: 'right',
    mobileLabel: 'Interest',
    priority: 'secondary',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'text-danger',
  },
  { key: 'actions', header: '', priority: 'actions', width: 40 },
];

function PaymentHistoryEmpty() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-sunken px-4 py-4 text-fg-faint">
      <Clock size={16} className="flex-shrink-0" />
      <span className="text-sm">No payments recorded yet.</span>
    </div>
  );
}

function PaymentHistoryTable({
  debt,
  onSortChange,
  sort,
  sortedPayments,
  onDeletePayment,
}: Readonly<PaymentHistoryTableProps>) {
  const { fmtNative } = useCurrency();

  return (
    <DataTable
      variant="plain"
      density="compact"
      tableVariant="financial"
      columns={PAYMENT_COLUMNS}
      sort={sort}
      onSortChange={onSortChange}
      className="rounded-xl border border-border-subtle"
      tableClassName="text-xs"
      bodyClassName="md:overflow-hidden"
    >
      {sortedPayments.map((payment) => (
        <DataTableRow key={payment.id} interactive>
          <DataTableCell columnKey="date" className="text-fg-muted">
            {formatDate(payment.date, { day: 'numeric', month: 'short' })}
          </DataTableCell>
          <DataTableCell columnKey="amount">
            {fmtNative(payment.amount, debt.currency, true)}
          </DataTableCell>
          <DataTableCell columnKey="principal">
            {fmtNative(payment.principal, debt.currency, true)}
          </DataTableCell>
          <DataTableCell columnKey="interest">
            {fmtNative(payment.interest, debt.currency, true)}
          </DataTableCell>
          <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
            <button
              type="button"
              onClick={() => onDeletePayment(payment.id)}
              className="rounded-md p-1 text-fg-disabled opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100 max-md:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </DataTableCell>
        </DataTableRow>
      ))}
    </DataTable>
  );
}

export function PaymentHistory({
  debt,
  payments,
  onLogPayment,
  onDeletePayment,
}: Readonly<PaymentHistoryProps>) {
  const [sort, setSort] = useState<DataTableSortState>({ columnKey: 'date', direction: 'desc' });
  const sortedPayments = useSortedRows(payments, PAYMENT_COLUMNS, sort, newestFirst);

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          Payment History
        </p>
        <Button
          size="sm"
          className="bg-success hover:bg-success-fg"
          leadingIcon={<Plus size={12} />}
          onClick={onLogPayment}
        >
          Log Payment
        </Button>
      </div>

      {sortedPayments.length === 0 ? (
        <PaymentHistoryEmpty />
      ) : (
        <PaymentHistoryTable
          debt={debt}
          sortedPayments={sortedPayments}
          sort={sort}
          onSortChange={setSort}
          onDeletePayment={onDeletePayment}
        />
      )}
    </div>
  );
}

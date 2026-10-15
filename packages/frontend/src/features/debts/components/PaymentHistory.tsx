import { useSortedRows, newestFirst } from '@/hooks/useSortedRows';
import { useState } from 'react';
import { type Debt, type DebtPayment } from '@quro/shared';
import { Clock, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  IconButton,
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

// Dates read "01 Oct 2026".
const PAYMENT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
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
    cellClassName: 'font-medium text-fg',
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
  },
  { key: 'actions', header: '', priority: 'actions', width: 44 },
];

function PaymentHistoryEmpty() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border-control px-3 py-3 text-fg-muted">
      <Clock size={14} className="shrink-0 text-fg-faint" aria-hidden />
      <span className="text-cell">No payments recorded yet.</span>
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
      className="rounded-md border border-border-default"
      bodyClassName="md:overflow-hidden"
    >
      {sortedPayments.map((payment) => (
        <DataTableRow key={payment.id} interactive>
          <DataTableCell columnKey="date" className="text-fg-muted">
            {formatDate(payment.date, PAYMENT_DATE_OPTIONS)}
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
            <IconButton
              icon={Trash2}
              label="Delete payment"
              title="Delete payment"
              variant="danger"
              size="sm"
              className="opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
              onClick={() => onDeletePayment(payment.id)}
            />
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
    <div className="border-t border-border-subtle pt-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-cell font-semibold text-fg">Payment history</h4>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Plus size={12} aria-hidden />}
          onClick={onLogPayment}
        >
          Log payment
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

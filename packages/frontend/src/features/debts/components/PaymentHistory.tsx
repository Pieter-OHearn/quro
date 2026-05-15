import { useMemo, useState } from 'react';
import type { Debt, DebtPayment } from '@quro/shared';
import { Clock, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  type DataTableSortState,
} from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatShortDate } from '../utils/forms';

type PaymentHistoryProps = {
  debt: Debt;
  payments: readonly DebtPayment[];
  onLogPayment: () => void;
  onDeletePayment: (id: number) => void;
};

const SORT_ASCENDING = 1;
const SORT_DESCENDING = -1;

type PaymentHistoryTableProps = Omit<PaymentHistoryProps, 'onLogPayment' | 'payments'> & {
  sortedPayments: DebtPayment[];
  sort: DataTableSortState;
  onSortChange: (sort: DataTableSortState) => void;
};

const PAYMENT_COLUMNS = [
  {
    key: 'date',
    header: 'Date',
    mobileLabel: 'Date',
    sortable: true,
    defaultSortDirection: 'desc',
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    mobileLabel: 'Amount',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'font-semibold text-slate-800',
  },
  {
    key: 'principal',
    header: 'Principal',
    align: 'right',
    mobileLabel: 'Principal',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'font-medium text-emerald-600',
  },
  {
    key: 'interest',
    header: 'Interest',
    align: 'right',
    mobileLabel: 'Interest',
    priority: 'secondary',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'text-rose-500',
  },
  { key: 'actions', header: '', priority: 'actions', width: 40 },
] as const;

function PaymentHistoryEmpty() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-4 text-slate-400">
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
      className="rounded-xl border border-slate-100"
      tableClassName="text-xs"
      bodyClassName="md:overflow-hidden"
    >
      {sortedPayments.map((payment) => (
        <DataTableRow key={payment.id} interactive>
          <DataTableCell columnKey="date" className="text-slate-600">
            {formatShortDate(payment.date)}
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
              className="rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100 max-md:opacity-100"
            >
              <Trash2 size={12} />
            </button>
          </DataTableCell>
        </DataTableRow>
      ))}
    </DataTable>
  );
}

function sortDebtPayments(payments: readonly DebtPayment[], sort: DataTableSortState) {
  const direction = sort.direction === 'asc' ? SORT_ASCENDING : SORT_DESCENDING;

  return [...payments].sort((left, right) => {
    const comparison = getDebtPaymentSortComparison(left, right, sort.columnKey);

    return comparison * direction || right.date.localeCompare(left.date) || right.id - left.id;
  });
}

function getDebtPaymentSortComparison(left: DebtPayment, right: DebtPayment, columnKey: string) {
  if (columnKey === 'amount') return left.amount - right.amount;
  if (columnKey === 'principal') return left.principal - right.principal;
  if (columnKey === 'interest') return left.interest - right.interest;
  return left.date.localeCompare(right.date);
}

export function PaymentHistory({
  debt,
  payments,
  onLogPayment,
  onDeletePayment,
}: Readonly<PaymentHistoryProps>) {
  const [sort, setSort] = useState<DataTableSortState>({ columnKey: 'date', direction: 'desc' });
  const sortedPayments = useMemo(() => sortDebtPayments(payments, sort), [payments, sort]);

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Payment History
        </p>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
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

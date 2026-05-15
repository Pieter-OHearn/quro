import { useMemo, useState } from 'react';
import { CURRENCY_META, type Payslip } from '@quro/shared';
import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  IconButton,
  RowActions,
  type DataTableColumn,
  type DataTableSortState,
} from '@/components/ui';
import { buildApiDownloadUrl } from '@/lib/pdfDocuments';
import { formatDate } from '@/lib/utils';
import { Download, Edit3, Plus } from 'lucide-react';
import type { FmtFn } from '../types';

type PayslipTableProps = {
  payslips: readonly Payslip[];
  selected: Payslip | null;
  fmtBase: FmtFn;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onEdit: (payslip: Payslip) => void;
};

const SORT_ASCENDING = 1;
const SORT_DESCENDING = -1;

const PAYSLIP_COLUMNS: readonly DataTableColumn[] = [
  {
    key: 'month',
    header: 'Month',
    mobileLabel: 'Month',
    priority: 'primary',
    width: '28%',
    sortable: true,
    defaultSortDirection: 'desc',
  },
  {
    key: 'gross',
    header: 'Gross',
    align: 'right',
    mobileLabel: 'Gross',
    width: '15%',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'whitespace-nowrap font-semibold text-slate-800',
  },
  {
    key: 'tax',
    header: 'Tax',
    align: 'right',
    mobileLabel: 'Tax',
    priority: 'secondary',
    width: '15%',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'whitespace-nowrap',
  },
  {
    key: 'pension',
    header: 'Pension',
    align: 'right',
    mobileLabel: 'Pension',
    priority: 'secondary',
    width: '15%',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'whitespace-nowrap',
  },
  {
    key: 'net',
    header: 'Net Pay',
    align: 'right',
    mobileLabel: 'Net pay',
    width: '15%',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'whitespace-nowrap font-bold text-emerald-600',
  },
  { key: 'actions', header: '', priority: 'actions', width: 96 },
];

function formatSignedAmount(value: number, currency: Payslip['currency'], fmtBase: FmtFn): string {
  return `${value < 0 ? '+' : '\u2212'}${fmtBase(Math.abs(value), currency)}`;
}

function PayslipRowActions({
  payslip,
  onEdit,
}: Readonly<{
  payslip: Payslip;
  onEdit: (payslip: Payslip) => void;
}>) {
  const downloadUrl = buildApiDownloadUrl(`/api/salary/payslips/${payslip.id}/document/download`);

  return (
    <RowActions>
      {payslip.document ? (
        <IconButton
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          icon={Download}
          label="Download payslip"
          title="Download payslip"
          variant="ghost"
        />
      ) : (
        <IconButton
          disabled
          onClick={(event) => event.stopPropagation()}
          icon={Download}
          label="No payslip PDF"
          title="No payslip PDF"
          className="text-slate-200"
        />
      )}
      <IconButton
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(payslip);
        }}
        icon={Edit3}
        label="Edit payslip"
        title="Edit payslip"
        variant="ghost"
      />
    </RowActions>
  );
}

function PayslipTableRow({
  payslip,
  isSelected,
  fmtBase,
  onSelect,
  onEdit,
}: Readonly<{
  payslip: Payslip;
  isSelected: boolean;
  fmtBase: FmtFn;
  onSelect: (id: number) => void;
  onEdit: (payslip: Payslip) => void;
}>) {
  const currencyMeta = CURRENCY_META[payslip.currency];
  const taxClass = payslip.tax < 0 ? 'text-emerald-600' : 'text-rose-500';
  const pensionClass = payslip.pension < 0 ? 'text-emerald-600' : 'text-indigo-600';

  return (
    <DataTableRow onClick={() => onSelect(payslip.id)} selected={isSelected} interactive>
      <DataTableCell columnKey="month">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800">{payslip.month}</span>
          <Badge tone="info" size="sm">
            <span aria-hidden>{currencyMeta.flag}</span>
            <span>{payslip.currency}</span>
          </Badge>
          {payslip.bonus && (
            <Badge tone="warning" size="xs">
              +Bonus
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-400">{formatDate(payslip.date)}</p>
      </DataTableCell>
      <DataTableCell columnKey="gross">{fmtBase(payslip.gross, payslip.currency)}</DataTableCell>
      <DataTableCell columnKey="tax" className={taxClass}>
        {formatSignedAmount(payslip.tax, payslip.currency, fmtBase)}
      </DataTableCell>
      <DataTableCell columnKey="pension" className={pensionClass}>
        {formatSignedAmount(payslip.pension, payslip.currency, fmtBase)}
      </DataTableCell>
      <DataTableCell columnKey="net">{fmtBase(payslip.net, payslip.currency)}</DataTableCell>
      <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
        <PayslipRowActions payslip={payslip} onEdit={onEdit} />
      </DataTableCell>
    </DataTableRow>
  );
}

function sortPayslips(payslips: readonly Payslip[], sort: DataTableSortState): Payslip[] {
  const direction = sort.direction === 'asc' ? SORT_ASCENDING : SORT_DESCENDING;

  return [...payslips].sort((a, b) => {
    const comparison = getPayslipSortComparison(a, b, sort.columnKey);

    return comparison * direction || b.date.localeCompare(a.date) || b.id - a.id;
  });
}

function getPayslipSortComparison(a: Payslip, b: Payslip, columnKey: string) {
  if (columnKey === 'gross') return a.gross - b.gross;
  if (columnKey === 'tax') return a.tax - b.tax;
  if (columnKey === 'pension') return a.pension - b.pension;
  if (columnKey === 'net') return a.net - b.net;
  return a.date.localeCompare(b.date);
}

export function PayslipHistoryTable({
  payslips,
  selected,
  fmtBase,
  onSelect,
  onAdd,
  onEdit,
}: Readonly<PayslipTableProps>) {
  const [sort, setSort] = useState<DataTableSortState>({ columnKey: 'month', direction: 'desc' });
  const sortedPayslips = useMemo(() => sortPayslips(payslips, sort), [payslips, sort]);

  return (
    <DataTable
      title="Payslip History"
      subtitle={`${payslips.length} payslips · click a row to view breakdown`}
      action={
        <Button
          onClick={onAdd}
          variant="primary"
          size="md"
          leadingIcon={<Plus size={15} />}
          data-testid="salary-add-payslip-button"
        >
          Add Payslip
        </Button>
      }
      columns={PAYSLIP_COLUMNS}
      sort={sort}
      onSortChange={setSort}
      isEmpty={payslips.length === 0}
      emptyState={
        <>
          No payslips yet. Click <strong>Add Payslip</strong> to get started.
        </>
      }
      minWidth={860}
      tableLayout="fixed"
      tableVariant="financial"
    >
      {sortedPayslips.map((payslip) => (
        <PayslipTableRow
          key={payslip.id}
          payslip={payslip}
          isSelected={selected?.id === payslip.id}
          fmtBase={fmtBase}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}
    </DataTable>
  );
}

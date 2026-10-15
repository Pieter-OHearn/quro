import { useSortedRows, newestFirst } from '@/hooks/useSortedRows';
import { useState } from 'react';
import { CURRENCY_META, type Payslip } from '@quro/shared';
import {
  Badge,
  Button,
  Change,
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
  baseCurrency: string;
  convertToBase: (amount: number, fromCurrency: string) => number;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onEdit: (payslip: Payslip) => void;
};

const PAYSLIP_COLUMNS: readonly DataTableColumn<Payslip>[] = [
  {
    key: 'month',
    sortValue: (row) => row.date,
    header: 'Month',
    mobileLabel: 'Month',
    priority: 'primary',
    width: '28%',
    sortable: true,
    defaultSortDirection: 'desc',
  },
  {
    key: 'gross',
    sortValue: (row) => row.gross,
    header: 'Gross',
    align: 'right',
    mobileLabel: 'Gross',
    width: '15%',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'whitespace-nowrap font-medium text-fg',
  },
  {
    key: 'tax',
    sortValue: (row) => row.tax,
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
    sortValue: (row) => row.pension,
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
    sortValue: (row) => row.net,
    header: 'Net pay',
    align: 'right',
    mobileLabel: 'Net pay',
    width: '15%',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'whitespace-nowrap font-medium text-fg',
  },
  { key: 'actions', header: '', priority: 'actions', width: 96 },
];

type ToBaseFn = (amount: number, fromCurrency: string) => number;

// A deduction reads as a loss; a correction (a negative deduction) reads as a gain.
function DeductionAmount({
  value,
  currency,
  baseCurrency,
  convertToBase,
}: Readonly<{
  value: number;
  currency: Payslip['currency'];
  baseCurrency: string;
  convertToBase: ToBaseFn;
}>) {
  return (
    <Change
      format="amount"
      currency={baseCurrency}
      value={-convertToBase(value, currency)}
      showArrow={false}
    />
  );
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
  baseCurrency,
  convertToBase,
  onSelect,
  onEdit,
}: Readonly<{
  payslip: Payslip;
  isSelected: boolean;
  fmtBase: FmtFn;
  baseCurrency: string;
  convertToBase: ToBaseFn;
  onSelect: (id: number) => void;
  onEdit: (payslip: Payslip) => void;
}>) {
  const currencyMeta = CURRENCY_META[payslip.currency];

  return (
    <DataTableRow onClick={() => onSelect(payslip.id)} selected={isSelected} interactive>
      <DataTableCell columnKey="month">
        <div className="flex items-center gap-2">
          <span className="font-medium text-fg">{payslip.month}</span>
          <Badge size="sm">
            <span aria-hidden>{currencyMeta.flag}</span>
            <span>{payslip.currency}</span>
          </Badge>
          {payslip.bonus && (
            <Badge tone="brand" size="xs">
              +Bonus
            </Badge>
          )}
        </div>
        <p className="text-caption text-fg-subtle">{formatDate(payslip.date)}</p>
      </DataTableCell>
      <DataTableCell columnKey="gross">{fmtBase(payslip.gross, payslip.currency)}</DataTableCell>
      <DataTableCell columnKey="tax">
        <DeductionAmount
          value={payslip.tax}
          currency={payslip.currency}
          baseCurrency={baseCurrency}
          convertToBase={convertToBase}
        />
      </DataTableCell>
      <DataTableCell columnKey="pension">
        <DeductionAmount
          value={payslip.pension}
          currency={payslip.currency}
          baseCurrency={baseCurrency}
          convertToBase={convertToBase}
        />
      </DataTableCell>
      <DataTableCell columnKey="net">{fmtBase(payslip.net, payslip.currency)}</DataTableCell>
      <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
        <PayslipRowActions payslip={payslip} onEdit={onEdit} />
      </DataTableCell>
    </DataTableRow>
  );
}

export function PayslipHistoryTable({
  payslips,
  selected,
  fmtBase,
  baseCurrency,
  convertToBase,
  onSelect,
  onAdd,
  onEdit,
}: Readonly<PayslipTableProps>) {
  const [sort, setSort] = useState<DataTableSortState>({ columnKey: 'month', direction: 'desc' });
  const sortedPayslips = useSortedRows(payslips, PAYSLIP_COLUMNS, sort, newestFirst);

  return (
    <DataTable
      title="Payslip history"
      subtitle={`${payslips.length} payslips · click a row to view breakdown`}
      action={
        <Button
          onClick={onAdd}
          variant="primary"
          size="sm"
          leadingIcon={<Plus size={12} aria-hidden />}
          data-testid="salary-add-payslip-button"
        >
          Add payslip
        </Button>
      }
      columns={PAYSLIP_COLUMNS}
      sort={sort}
      onSortChange={setSort}
      isEmpty={payslips.length === 0}
      emptyState={
        <>
          No payslips yet. Click <strong>Add payslip</strong> to get started.
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
          baseCurrency={baseCurrency}
          convertToBase={convertToBase}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}
    </DataTable>
  );
}

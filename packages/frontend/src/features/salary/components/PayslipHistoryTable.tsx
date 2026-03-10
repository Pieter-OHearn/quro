import { CURRENCY_META, type Payslip } from '@quro/shared';
import { Badge, Button, DataTable, IconButton, RowActions } from '@/components/ui';
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
  const amountCellClass = 'px-4 py-3 text-right tabular-nums whitespace-nowrap';
  const taxClass = payslip.tax < 0 ? 'text-emerald-600' : 'text-rose-500';
  const pensionClass = payslip.pension < 0 ? 'text-emerald-600' : 'text-indigo-600';

  return (
    <tr
      onClick={() => onSelect(payslip.id)}
      className={`group border-b border-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
    >
      <td className="px-4 py-3">
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
      </td>
      <td className={`${amountCellClass} font-semibold text-slate-800`}>
        {fmtBase(payslip.gross, payslip.currency)}
      </td>
      <td className={`${amountCellClass} ${taxClass}`}>
        {formatSignedAmount(payslip.tax, payslip.currency, fmtBase)}
      </td>
      <td className={`${amountCellClass} ${pensionClass}`}>
        {formatSignedAmount(payslip.pension, payslip.currency, fmtBase)}
      </td>
      <td className={`${amountCellClass} font-bold text-emerald-600`}>
        {fmtBase(payslip.net, payslip.currency)}
      </td>
      <td className="w-24 px-4 py-3">
        <PayslipRowActions payslip={payslip} onEdit={onEdit} />
      </td>
    </tr>
  );
}

export function PayslipHistoryTable({
  payslips,
  selected,
  fmtBase,
  onSelect,
  onAdd,
  onEdit,
}: Readonly<PayslipTableProps>) {
  return (
    <DataTable
      title="Payslip History"
      subtitle={`${payslips.length} payslips · click a row to view breakdown`}
      action={
        <Button onClick={onAdd} variant="primary" size="md" leadingIcon={<Plus size={15} />}>
          Add Payslip
        </Button>
      }
      columns={[
        { key: 'month', header: 'Month' },
        { key: 'gross', header: 'Gross', align: 'right' },
        { key: 'tax', header: 'Tax', align: 'right' },
        { key: 'pension', header: 'Pension', align: 'right' },
        { key: 'net', header: 'Net Pay', align: 'right' },
        { key: 'actions', header: '' },
      ]}
      colGroup={
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
          <col className="w-24" />
        </colgroup>
      }
      isEmpty={payslips.length === 0}
      emptyState={
        <>
          No payslips yet. Click <strong>Add Payslip</strong> to get started.
        </>
      }
      minWidth={860}
      tableLayout="fixed"
    >
      {payslips.map((payslip) => (
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

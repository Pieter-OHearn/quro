import { CURRENCY_META, type Payslip } from '@quro/shared';
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
    <div className="flex items-center justify-end gap-1">
      {payslip.document ? (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors"
          title="Download payslip"
        >
          <Download size={14} />
        </a>
      ) : (
        <button
          type="button"
          disabled
          onClick={(event) => event.stopPropagation()}
          className="p-1.5 rounded-lg text-slate-200 cursor-not-allowed"
          title="No payslip PDF"
        >
          <Download size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(payslip);
        }}
        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors"
        title="Edit payslip"
      >
        <Edit3 size={14} />
      </button>
    </div>
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
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
            <span aria-hidden>{currencyMeta.flag}</span>
            <span>{payslip.currency}</span>
          </span>
          {payslip.bonus && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              +Bonus
            </span>
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

function PayslipTableHeader({ count, onAdd }: Readonly<{ count: number; onAdd: () => void }>) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
      <div>
        <h3 className="font-semibold text-slate-900">Payslip History</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {count} payslips · click a row to view breakdown
        </p>
      </div>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
      >
        <Plus size={15} /> Add Payslip
      </button>
    </div>
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
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <PayslipTableHeader count={payslips.length} onAdd={onAdd} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                Month
              </th>
              {['Gross', 'Tax', 'Pension', 'Net Pay'].map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
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
            {payslips.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                  No payslips yet. Click <strong>Add Payslip</strong> to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

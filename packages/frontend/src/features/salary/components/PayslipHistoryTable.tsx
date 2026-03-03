import { CURRENCY_META, type Payslip } from '@quro/shared';
import { formatDate } from '@/lib/utils';
import { Download, Plus, Trash2 } from 'lucide-react';
import type { FmtFn } from '../types';

type PayslipTableProps = {
  payslips: readonly Payslip[];
  selected: Payslip | null;
  fmtBase: FmtFn;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onDelete: (id: number) => void;
};

function PayslipRowActions({
  id,
  onDelete,
}: Readonly<{
  id: number;
  onDelete: (id: number) => void;
}>) {
  return (
    <div className="flex items-center gap-1">
      <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-500 transition-colors">
        <Download size={14} />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onDelete(id);
        }}
        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function PayslipTableRow({
  payslip,
  isSelected,
  fmtBase,
  onSelect,
  onDelete,
}: Readonly<{
  payslip: Payslip;
  isSelected: boolean;
  fmtBase: FmtFn;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}>) {
  const currencyMeta = CURRENCY_META[payslip.currency];

  return (
    <tr
      onClick={() => onSelect(payslip.id)}
      className={`border-b border-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
    >
      <td className="py-3 px-4">
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
      <td className="py-3 px-4 font-semibold text-slate-800">
        {fmtBase(payslip.gross, payslip.currency)}
      </td>
      <td className="py-3 px-4 text-rose-500">
        {'\u2212'}
        {fmtBase(payslip.tax, payslip.currency)}
      </td>
      <td className="py-3 px-4 text-indigo-600">
        {'\u2212'}
        {fmtBase(payslip.pension, payslip.currency)}
      </td>
      <td className="py-3 px-4 font-bold text-emerald-600">
        {fmtBase(payslip.net, payslip.currency)}
      </td>
      <td className="py-3 px-4">
        <PayslipRowActions id={payslip.id} onDelete={onDelete} />
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
  onDelete,
}: Readonly<PayslipTableProps>) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <PayslipTableHeader count={payslips.length} onAdd={onAdd} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {['Month', 'Gross', 'Tax', 'Pension', 'Net Pay', ''].map((header) => (
                <th
                  key={header}
                  className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
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
                onDelete={onDelete}
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

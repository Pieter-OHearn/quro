import type { Payslip } from '@quro/shared';
import type { FmtFn } from '../types';
import { buildBreakdownItems } from '../utils/salary-data';

type PayBreakdownPanelProps = {
  selected: Payslip | null;
  fmtBase: FmtFn;
};

function PayBreakdownDetail({
  selected,
  fmtBase,
}: Readonly<{ selected: Payslip; fmtBase: FmtFn }>) {
  return (
    <>
      <div className="flex h-7 rounded-xl overflow-hidden mb-5 gap-px">
        <div
          className="bg-emerald-500 h-full"
          style={{ width: `${(selected.net / selected.gross) * 100}%` }}
        />
        <div
          className="bg-rose-400 h-full"
          style={{ width: `${(selected.tax / selected.gross) * 100}%` }}
        />
        <div
          className="bg-indigo-400 h-full"
          style={{ width: `${(selected.pension / selected.gross) * 100}%` }}
        />
      </div>
      <div className="space-y-2.5">
        {buildBreakdownItems(selected).map(({ label, val, color, tc, pct }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-sm ${color}`} />
              <span className="text-sm text-slate-600">{label}</span>
            </div>
            <div className="flex items-center gap-3">
              {pct !== undefined && (
                <span className="text-xs text-slate-400">{pct.toFixed(0)}%</span>
              )}
              <span className={`text-sm font-semibold ${tc}`}>
                {val >= 0 ? '+' : '\u2212'}
                {fmtBase(Math.abs(val))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function PayBreakdownPanel({ selected, fmtBase }: Readonly<PayBreakdownPanelProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Pay Breakdown</h3>
      <p className="text-xs text-slate-400 mb-4">
        {selected?.month ?? '—'} — click a payslip row to switch month
      </p>
      {selected ? (
        <PayBreakdownDetail selected={selected} fmtBase={fmtBase} />
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">No payslips yet.</p>
      )}
    </div>
  );
}

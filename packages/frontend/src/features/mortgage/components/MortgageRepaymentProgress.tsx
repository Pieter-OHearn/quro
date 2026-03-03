import type { Mortgage as MortgageType } from '@quro/shared';
import type { MortgageFormatFn } from '../types';

type MortgageRepaymentProgressProps = {
  mortgage: MortgageType;
  fmt: MortgageFormatFn;
  paid: number;
  paidPct: number;
};

export function MortgageRepaymentProgress({
  mortgage,
  fmt,
  paid,
  paidPct,
}: Readonly<MortgageRepaymentProgressProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900">Mortgage Repayment Progress</h3>
        <span className="text-sm font-semibold text-indigo-600">
          {paidPct.toFixed(1)}% paid off
        </span>
      </div>
      <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
          style={{ width: `${paidPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>
          {fmt(0)} ({mortgage.startDate})
        </span>
        <span className="text-indigo-600 font-medium">{fmt(paid)} repaid</span>
        <span>
          {fmt(mortgage.originalAmount)} ({mortgage.endDate})
        </span>
      </div>
    </div>
  );
}

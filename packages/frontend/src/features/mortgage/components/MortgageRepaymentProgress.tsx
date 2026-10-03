import { formatPercent, type Mortgage as MortgageType } from '@quro/shared';
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
    <div className="bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-fg">Mortgage Repayment Progress</h3>
        <span className="text-sm font-semibold text-brand">
          {formatPercent(paidPct, 1)} paid off
        </span>
      </div>
      <div className="w-full h-4 bg-surface-muted rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-gradient-to-r from-brand-accent to-accent-premium-accent rounded-full transition-all"
          style={{ width: `${paidPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-fg-faint">
        <span>
          {fmt(0)} ({mortgage.startDate})
        </span>
        <span className="text-brand font-medium">{fmt(paid)} repaid</span>
        <span>
          {fmt(mortgage.originalAmount)} ({mortgage.endDate})
        </span>
      </div>
    </div>
  );
}

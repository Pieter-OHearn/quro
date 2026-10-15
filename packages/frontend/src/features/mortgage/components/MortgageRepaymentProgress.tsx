import { formatPercent, type Mortgage as MortgageType } from '@quro/shared';
import { Card, ProgressMeter } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
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
  const { numberFormat } = useCurrency();
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-title-section text-fg">Mortgage repayment progress</h3>
        <span className="text-figure-md font-numeric text-fg">
          {formatPercent(paidPct, numberFormat, 1)} paid off
        </span>
      </div>
      <ProgressMeter
        value={paidPct}
        label="Mortgage repayment progress"
        className="mb-2"
        indicatorClassName="bg-brand"
      />
      <div className="flex flex-wrap justify-between gap-x-3 text-caption text-fg-subtle font-numeric">
        <span>
          {fmt(0)} ({mortgage.startDate})
        </span>
        <span className="font-medium text-fg">{fmt(paid)} repaid</span>
        <span>
          {fmt(mortgage.originalAmount)} ({mortgage.endDate})
        </span>
      </div>
    </Card>
  );
}

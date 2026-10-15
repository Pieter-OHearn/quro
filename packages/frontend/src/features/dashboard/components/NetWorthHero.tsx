import { useId } from 'react';
import { Change } from '@/components/ui';
import type { CompactFormatFn } from '../types';

const MINUS_SIGN = '−';

/** The page hero: the net-worth figure with its change, then assets and debts as a caption. */
export function NetWorthHero({
  netWorth,
  monthChange,
  comparisonLabel,
  ytdPct,
  totalAssets,
  liabilitiesTotal,
  baseCurrency,
  fmtBase,
  isEstimated,
}: Readonly<{
  netWorth: number;
  monthChange: number;
  /** Month and year of the snapshot the change is measured against, e.g. "Sep 2026". */
  comparisonLabel: string | null;
  ytdPct: number;
  totalAssets: number;
  liabilitiesTotal: number;
  baseCurrency: string;
  fmtBase: CompactFormatFn;
  isEstimated: boolean;
}>) {
  const labelId = useId();
  const showMonthChange = monthChange !== 0;
  const showYtd = ytdPct !== 0;

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-1">
      <p id={labelId} className="text-label text-fg-muted">
        Net worth
      </p>
      <p className="text-figure-hero font-numeric text-fg" data-testid="dashboard-net-worth-value">
        {isEstimated ? '~' : ''}
        {fmtBase(netWorth)}
      </p>
      {showMonthChange || showYtd ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {showMonthChange ? (
            <span className="inline-flex items-baseline gap-1.5">
              <Change value={monthChange} format="amount" currency={baseCurrency} />
              <span className="text-caption text-fg-subtle">
                {comparisonLabel ? `since ${comparisonLabel}` : 'this month'}
              </span>
            </span>
          ) : null}
          {showYtd ? (
            <span className="inline-flex items-baseline gap-1.5">
              <Change value={ytdPct} format="percent" variant="chip" />
              <span className="text-caption text-fg-subtle">year to date</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <p className="text-caption text-fg-subtle">
        Assets <span className="font-numeric text-fg-muted">{fmtBase(totalAssets)}</span>
        <span aria-hidden="true"> · </span>
        Debts{' '}
        <span className="font-numeric text-fg-muted">
          {liabilitiesTotal > 0 ? MINUS_SIGN : ''}
          {fmtBase(liabilitiesTotal)}
        </span>
      </p>
      {isEstimated ? (
        <p className="text-caption text-fg-subtle">Includes estimated historical rates or prices</p>
      ) : null}
    </section>
  );
}

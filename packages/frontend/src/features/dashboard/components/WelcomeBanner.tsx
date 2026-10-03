import { TrendingDown, TrendingUp } from 'lucide-react';
import type { CompactFormatFn } from '../types';

function NetWorthBadge({
  netWorth,
  monthChange,
  totalAssets,
  liabilitiesTotal,
  fmtBase,
  isEstimated,
}: Readonly<{
  netWorth: number;
  monthChange: number;
  totalAssets: number;
  liabilitiesTotal: number;
  fmtBase: CompactFormatFn;
  isEstimated: boolean;
}>) {
  return (
    <div className="bg-surface/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-center flex-shrink-0 min-w-[220px]">
      <p className="text-brand-border text-xs uppercase tracking-widest mb-1">Net Worth</p>
      <p className="text-3xl font-bold" data-testid="dashboard-net-worth-value">
        {isEstimated ? '~' : ''}
        {fmtBase(netWorth)}
      </p>
      {monthChange !== 0 && (
        <div className="flex items-center justify-center gap-1 mt-1">
          {monthChange >= 0 ? (
            <TrendingUp size={13} className="text-success-muted" />
          ) : (
            <TrendingDown size={13} className="text-danger-muted" />
          )}
          <span
            className={`text-xs ${monthChange >= 0 ? 'text-success-muted' : 'text-danger-muted'}`}
          >
            {monthChange >= 0 ? '+' : ''}
            {fmtBase(monthChange)} this month
          </span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-center gap-3 text-[11px]">
        <span className="text-fg-faint">
          Assets{' '}
          <span className="font-medium text-success-border-strong">{fmtBase(totalAssets)}</span>
        </span>
        <span className="text-fg-muted">·</span>
        <span className="text-fg-faint">
          Debts{' '}
          <span className="font-medium text-danger-border-strong">
            -{fmtBase(liabilitiesTotal)}
          </span>
        </span>
      </div>
      {isEstimated ? (
        <p className="mt-2 text-[10px] text-fg-inverted/80">
          Includes estimated historical rates or prices
        </p>
      ) : null}
    </div>
  );
}

export function WelcomeBanner({
  greeting,
  greetingName,
  netWorth,
  monthChange,
  totalAssets,
  liabilitiesTotal,
  baseCurrency,
  fmtBase,
  isEstimated,
}: Readonly<{
  greeting: string;
  greetingName: string;
  netWorth: number;
  monthChange: number;
  totalAssets: number;
  liabilitiesTotal: number;
  baseCurrency: string;
  fmtBase: CompactFormatFn;
  isEstimated: boolean;
}>) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-surface-inverse via-surface-inverse-panel to-surface-welcome-end p-6 text-fg-inverted overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-accent/10 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 right-24 w-40 h-40 bg-accent-premium-accent/10 rounded-full translate-y-1/2" />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-brand-border text-sm mb-1">
            {greeting}, {greetingName}
          </p>
          <h2 className="text-2xl font-bold">Your Financial Overview</h2>
          <p className="text-fg-faint text-sm mt-1">Base currency: {baseCurrency}</p>
        </div>
        <NetWorthBadge
          netWorth={netWorth}
          monthChange={monthChange}
          totalAssets={totalAssets}
          liabilitiesTotal={liabilitiesTotal}
          fmtBase={fmtBase}
          isEstimated={isEstimated}
        />
      </div>
    </div>
  );
}

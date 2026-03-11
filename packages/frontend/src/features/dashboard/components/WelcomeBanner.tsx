import { TrendingDown, TrendingUp } from 'lucide-react';
import type { CompactFormatFn } from '../types';

function NetWorthBadge({
  netWorth,
  monthChange,
  totalAssets,
  liabilitiesTotal,
  fmtBase,
}: Readonly<{
  netWorth: number;
  monthChange: number;
  totalAssets: number;
  liabilitiesTotal: number;
  fmtBase: CompactFormatFn;
}>) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-center flex-shrink-0 min-w-[220px]">
      <p className="text-indigo-300 text-xs uppercase tracking-widest mb-1">Net Worth</p>
      <p className="text-3xl font-bold">{fmtBase(netWorth)}</p>
      {monthChange !== 0 && (
        <div className="flex items-center justify-center gap-1 mt-1">
          {monthChange >= 0 ? (
            <TrendingUp size={13} className="text-emerald-400" />
          ) : (
            <TrendingDown size={13} className="text-rose-400" />
          )}
          <span className={`text-xs ${monthChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {monthChange >= 0 ? '+' : ''}
            {fmtBase(monthChange)} this month
          </span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-center gap-3 text-[11px]">
        <span className="text-slate-400">
          Assets <span className="font-medium text-emerald-300">{fmtBase(totalAssets)}</span>
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400">
          Debts <span className="font-medium text-rose-300">-{fmtBase(liabilitiesTotal)}</span>
        </span>
      </div>
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
}: Readonly<{
  greeting: string;
  greetingName: string;
  netWorth: number;
  monthChange: number;
  totalAssets: number;
  liabilitiesTotal: number;
  baseCurrency: string;
  fmtBase: CompactFormatFn;
}>) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-[#0a0f1e] via-[#1a1f3e] to-[#1e1448] p-6 text-white overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 right-24 w-40 h-40 bg-purple-500/10 rounded-full translate-y-1/2" />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-indigo-300 text-sm mb-1">
            {greeting}, {greetingName}
          </p>
          <h2 className="text-2xl font-bold">Your Financial Overview</h2>
          <p className="text-slate-400 text-sm mt-1">Base currency: {baseCurrency}</p>
        </div>
        <NetWorthBadge
          netWorth={netWorth}
          monthChange={monthChange}
          totalAssets={totalAssets}
          liabilitiesTotal={liabilitiesTotal}
          fmtBase={fmtBase}
        />
      </div>
    </div>
  );
}

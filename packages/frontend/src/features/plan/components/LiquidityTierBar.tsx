import type { RunwayResponse } from '@quro/shared';
import { Card, ProgressMeter } from '@/components/ui';
import { RUNWAY_CITATIONS } from '../utils/runway-display';

export function LiquidityTierBar({
  tiers,
  fmtBase,
}: Readonly<{ tiers: RunwayResponse['tiers']; fmtBase: (value: number) => string }>) {
  const maximum = Math.max(1, ...tiers.map((tier) => tier.amount));
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Liquidity tiers</h2>
          <p className="mt-1 text-sm text-slate-500">Accessible balances, in drawdown order.</p>
        </div>
        <p className="max-w-md text-right text-xs text-slate-400">{RUNWAY_CITATIONS.tiers}</p>
      </div>
      <div className="mt-6 space-y-5">
        {tiers.map((tier) => (
          <div key={tier.tier} className={tier.included ? '' : 'opacity-50'}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <div>
                <span className="font-semibold text-slate-800">
                  Tier {tier.tier} · {tier.label}
                </span>
                <span className="ml-2 text-xs text-slate-400">
                  {(tier.haircutPct * 100).toFixed(0)}% haircut
                </span>
              </div>
              <span className="font-semibold text-slate-900">{fmtBase(tier.amount)}</span>
            </div>
            <ProgressMeter
              value={tier.amount}
              max={maximum}
              label={`${tier.label} liquidity`}
              indicatorClassName={
                tier.tier === 1
                  ? 'bg-emerald-500'
                  : tier.tier === 2
                    ? 'bg-sky-500'
                    : 'bg-indigo-500'
              }
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {tier.included ? tier.note : 'Excluded by the current assumptions.'}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

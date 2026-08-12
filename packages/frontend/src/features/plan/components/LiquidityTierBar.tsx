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
          <h2 className="font-semibold text-fg">Liquidity tiers</h2>
          <p className="mt-1 text-sm text-fg-subtle">Accessible balances, in drawdown order.</p>
        </div>
        <p className="max-w-md text-right text-xs text-fg-faint">{RUNWAY_CITATIONS.tiers}</p>
      </div>
      <div className="mt-6 space-y-5">
        {tiers.map((tier) => (
          <div key={tier.tier} className={tier.included ? '' : 'opacity-50'}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <div>
                <span className="font-semibold text-fg-strong">
                  Tier {tier.tier} · {tier.label}
                </span>
                <span className="ml-2 text-xs text-fg-faint">
                  {(tier.haircutPct * 100).toFixed(0)}% haircut
                </span>
              </div>
              <span className="font-semibold text-fg">{fmtBase(tier.amount)}</span>
            </div>
            <ProgressMeter
              value={tier.amount}
              max={maximum}
              label={`${tier.label} liquidity`}
              indicatorClassName={
                tier.tier === 1 ? 'bg-success' : tier.tier === 2 ? 'bg-info' : 'bg-brand'
              }
            />
            <p className="mt-1.5 text-xs text-fg-faint">
              {tier.included ? tier.note : 'Excluded by the current assumptions.'}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

import { formatPercent, type RunwayResponse } from '@quro/shared';
import { useCurrency } from '@/lib/CurrencyContext';
import { Card, ProgressMeter } from '@/components/ui';
import { RUNWAY_CITATIONS } from '../utils/runway-display';

// Cash and term deposits are savings (`viz-1`, `viz-5` for the less liquid tier); brokerage is
// investments (`viz-2`).
const TIER_METER_CLASS_NAMES: Record<number, string> = {
  1: 'bg-viz-1',
  2: 'bg-viz-5',
  3: 'bg-viz-2',
};

export function LiquidityTierBar({
  tiers,
  fmtBase,
}: Readonly<{ tiers: RunwayResponse['tiers']; fmtBase: (value: number) => string }>) {
  const { numberFormat } = useCurrency();
  const maximum = Math.max(1, ...tiers.map((tier) => tier.amount));
  return (
    <Card>
      <div>
        <div>
          <h2 className="text-title-section text-fg">Liquidity tiers</h2>
          <p className="text-caption text-fg-subtle">Accessible balances, in drawdown order.</p>
        </div>
        <p className="mt-1 text-caption text-fg-subtle">{RUNWAY_CITATIONS.tiers}</p>
      </div>
      <div className="mt-4 space-y-4">
        {tiers.map((tier) => (
          <div key={tier.tier} className={tier.included ? '' : 'opacity-50'}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-cell">
              <div>
                <span className="font-medium text-fg">
                  Tier {tier.tier} · {tier.label}
                </span>
                <span className="ml-2 text-caption text-fg-subtle font-numeric">
                  {formatPercent(tier.haircutPct * 100, numberFormat, 0)} haircut
                </span>
              </div>
              <span className="font-medium font-numeric text-fg">{fmtBase(tier.amount)}</span>
            </div>
            <ProgressMeter
              value={tier.amount}
              max={maximum}
              label={`${tier.label} liquidity`}
              indicatorClassName={TIER_METER_CLASS_NAMES[tier.tier] ?? 'bg-viz-6'}
            />
            <p className="mt-1 text-caption text-fg-subtle">
              {tier.included ? tier.note : 'Excluded by the current assumptions.'}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

import type { RunwayResponse } from '@quro/shared';
import { StatCard, StatsGrid } from '@/components/ui';

export function BurnRateCards({
  burn,
  fmtBase,
}: Readonly<{ burn: RunwayResponse['burn']; fmtBase: (value: number) => string }>) {
  const comparisonAvailable = burn.burnSource !== 'derived_cashflow';
  return (
    <StatsGrid className="lg:grid-cols-3 xl:grid-cols-3">
      <StatCard
        label="Lean monthly burn"
        value={fmtBase(burn.lean)}
        subtitle={`${burn.burnSource.replaceAll('_', ' ')}${burn.isPartialHistory ? ' · partial history' : ''}`}
      />
      <StatCard
        label="Current monthly burn"
        value={fmtBase(burn.current)}
        subtitle="Net spending plus contractual payments"
      />
      <StatCard
        label="Lifestyle difference"
        value={
          comparisonAvailable ? fmtBase(Math.max(0, burn.current - burn.lean)) : 'Not available'
        }
        subtitle={comparisonAvailable ? 'Current minus lean burn' : 'Classify categories to unlock'}
      />
    </StatsGrid>
  );
}

import type { RunwayResponse } from '@quro/shared';
import { AreaChartCard } from '@/components/ui';

export function RunwayLedgerChart({
  ledger,
  fmtBase,
}: Readonly<{
  ledger: RunwayResponse['runway']['ledger'];
  fmtBase: (value: number) => string;
}>) {
  return (
    <AreaChartCard
      title="Runway ledger"
      subtitle="Modelled liquid balance after income and lean spending"
      data={ledger}
      dataKey="liquidRemaining"
      xKey="month"
      color="#4f46e5"
      formatValue={fmtBase}
      formatYAxis={(value) => fmtBase(value)}
      emptyMessage="Complete employment setup to add the benefit-adjusted ledger."
    />
  );
}

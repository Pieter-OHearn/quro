import { StatCard, StatsGrid } from '@/components/ui';
import type { PensionFormatBaseFn } from '../types';

type PensionSummaryStatsProps = {
  totalInBase: number;
  totalMonthlyContribInBase: number;
  monthlyDrawdown: number | null;
  pensionsCount: number;
  fmtBase: PensionFormatBaseFn;
};

export function PensionSummaryStats({
  totalInBase,
  totalMonthlyContribInBase,
  monthlyDrawdown,
  pensionsCount,
  fmtBase,
}: Readonly<PensionSummaryStatsProps>) {
  return (
    <StatsGrid>
      <StatCard
        label="Total pension value"
        value={fmtBase(totalInBase)}
        subtitle={`across ${pensionsCount} pots`}
      />
      <StatCard
        label="Monthly contributions"
        value={fmtBase(totalMonthlyContribInBase)}
        subtitle="combined (you + employer)"
      />
      <StatCard
        label="Annual contributions"
        value={fmtBase(totalMonthlyContribInBase * 12)}
        subtitle="in total per year"
      />
      <StatCard
        label="Monthly drawdown est."
        value={monthlyDrawdown == null ? '—' : fmtBase(monthlyDrawdown)}
        subtitle={monthlyDrawdown == null ? 'Set retirement horizon' : 'Over 25-year drawdown'}
      />
    </StatsGrid>
  );
}

import { Calendar, Clock, ShieldCheck, TrendingUp } from 'lucide-react';
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
        label="Total Pension Value"
        value={fmtBase(totalInBase)}
        subtitle={`across ${pensionsCount} pots`}
        icon={ShieldCheck}
        color="amber"
      />
      <StatCard
        label="Monthly Contributions"
        value={fmtBase(totalMonthlyContribInBase)}
        subtitle="combined (you + employer)"
        icon={TrendingUp}
        color="indigo"
      />
      <StatCard
        label="Annual Contributions"
        value={fmtBase(totalMonthlyContribInBase * 12)}
        subtitle="in total per year"
        icon={Calendar}
        color="emerald"
      />
      <StatCard
        label="Monthly Drawdown Est."
        value={monthlyDrawdown == null ? '—' : fmtBase(monthlyDrawdown)}
        subtitle={monthlyDrawdown == null ? 'Set retirement horizon' : 'Over 25-year drawdown'}
        icon={Clock}
        color="sky"
      />
    </StatsGrid>
  );
}

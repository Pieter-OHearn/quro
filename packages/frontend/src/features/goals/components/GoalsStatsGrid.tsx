import { StatCard, StatsGrid } from '@/components/ui';
import type { GoalStatsData } from '../types';
import { buildGoalStatCards } from '../utils/goals-data';

type GoalsStatsGridProps = {
  stats: GoalStatsData;
  activeYear: number;
  fmtBase: (n: number) => string;
};

export function GoalsStatsGrid({ stats, activeYear, fmtBase }: Readonly<GoalsStatsGridProps>) {
  const cards = buildGoalStatCards(stats, activeYear, fmtBase);

  return (
    <StatsGrid>
      {cards.map(({ label, value, sub, icon: Icon, color }) => (
        <StatCard
          key={label}
          label={label}
          value={value}
          subtitle={sub}
          icon={Icon}
          color={color}
        />
      ))}
    </StatsGrid>
  );
}

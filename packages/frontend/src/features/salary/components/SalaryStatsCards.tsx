import { StatCard, StatsGrid } from '@/components/ui';
import type { SalaryStatCard } from '../types';

export function SalaryStatsCards({ cards }: Readonly<{ cards: readonly SalaryStatCard[] }>) {
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

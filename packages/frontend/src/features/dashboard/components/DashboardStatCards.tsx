import { StatCard, StatsGrid } from '@/components/ui';
import type { DashboardCard, DashboardFormatFn } from '../types';

export function DashboardStatCards({
  cards,
  fmtBase,
}: Readonly<{
  cards: readonly DashboardCard[];
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <StatsGrid>
      {cards.map((card) => {
        const Icon = card.icon;
        const changeAmount = card.change.amount;
        return (
          <StatCard
            key={card.label}
            label={card.label}
            value={fmtBase(card.value)}
            icon={Icon}
            color={card.color}
            href={card.path}
            change={{
              value: `${changeAmount >= 0 ? '+' : '-'}${fmtBase(
                Math.abs(changeAmount),
                undefined,
                true,
              )} ${card.change.label}`,
              positive: changeAmount >= 0,
            }}
          />
        );
      })}
    </StatsGrid>
  );
}

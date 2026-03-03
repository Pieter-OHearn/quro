import { StatCard } from '@/components/ui';
import type { DashboardCard, DashboardFormatFn } from '../types';

export function DashboardStatCards({
  cards,
  fmtBase,
}: Readonly<{
  cards: readonly DashboardCard[];
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <StatCard
            key={card.label}
            label={card.label}
            value={fmtBase(card.value)}
            icon={Icon}
            color={card.color}
            href={card.path}
            change={{
              value: `${card.monthlyChange >= 0 ? '+' : '-'}${fmtBase(Math.abs(card.monthlyChange), undefined, true)} this month`,
              positive: card.monthlyChange >= 0,
            }}
          />
        );
      })}
    </div>
  );
}

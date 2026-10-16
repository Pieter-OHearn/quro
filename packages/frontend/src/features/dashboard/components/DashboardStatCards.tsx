import { StatCard, StatsGrid } from '@/components/ui';
import type { DashboardCard, DashboardFormatFn } from '../types';

/** Four stat cards: four across on a laptop, two across on a phone. */
export function DashboardStatCards({
  cards,
  baseCurrency,
  fmtBase,
}: Readonly<{
  cards: readonly DashboardCard[];
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <StatsGrid>
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={fmtBase(card.value)}
          href={card.path}
          testId={card.label === 'Salary' ? 'dashboard-monthly-salary-card' : undefined}
          change={{
            amount: card.change.amount,
            format: 'amount',
            currency: baseCurrency,
            label: card.change.label,
          }}
        />
      ))}
    </StatsGrid>
  );
}

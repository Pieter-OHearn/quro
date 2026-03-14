import { Banknote } from 'lucide-react';
import { StatCard, StatsGrid } from '@/components/ui';
import type { DashboardCard, DashboardFormatFn } from '../types';

export function DashboardStatCards({
  cards,
  liabilitiesValue,
  debtCount,
  fmtBase,
}: Readonly<{
  cards: readonly DashboardCard[];
  liabilitiesValue: number;
  debtCount: number;
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <StatsGrid className={'lg:grid-cols-3 xl:grid-cols-5'}>
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
            testId={card.label === 'Monthly Salary' ? 'dashboard-monthly-salary-card' : undefined}
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
      <StatCard
        label="Total Liabilities"
        value={fmtBase(liabilitiesValue)}
        subtitle={`${debtCount} active debt${debtCount === 1 ? '' : 's'}`}
        icon={Banknote}
        color="rose"
        href="/debts"
      />
    </StatsGrid>
  );
}

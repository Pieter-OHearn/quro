import { AlertTriangle, CheckCircle2, TrendingDown, Wallet } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatAsNegative } from '@/lib/liability';
import { StatCard, StatsGrid } from '@/components/ui';
import type { BudgetFormatFn } from '../types';
import { formatPercent } from '@quro/shared';

type BudgetSummaryCardsProps = {
  totalBudgeted: number;
  totalSpent: number;
  remaining: number;
  savingsRate: number;
  fmt: BudgetFormatFn;
};

function TotalBudgetCard({
  totalBudgeted,
  fmt,
}: Readonly<{ totalBudgeted: number; fmt: BudgetFormatFn }>) {
  return (
    <StatCard
      label="Total Budget"
      value={fmt(totalBudgeted)}
      subtitle="This month"
      icon={Wallet}
      color="indigo"
    />
  );
}

function TotalSpentCard({
  totalBudgeted,
  totalSpent,
  fmt,
}: Readonly<{ totalBudgeted: number; totalSpent: number; fmt: BudgetFormatFn }>) {
  return (
    <StatCard
      label="Total spent"
      value={fmt(totalSpent)}
      subtitle={`${totalBudgeted > 0 ? ((totalSpent / totalBudgeted) * 100).toFixed(0) : 0}% of budget`}
      icon={TrendingDown}
      color="rose"
    />
  );
}

// Under budget reads as a gain and over budget as a loss; exactly on budget has no sign.
function describeRemaining(remaining: number, fmt: BudgetFormatFn) {
  if (remaining > 0) return { value: `+${fmt(remaining)}`, tone: 'text-gain' };
  if (remaining < 0)
    return { value: formatAsNegative(fmt, Math.abs(remaining)), tone: 'text-loss' };
  return { value: fmt(remaining), tone: 'text-flat' };
}

function RemainingCard({ remaining, fmt }: Readonly<{ remaining: number; fmt: BudgetFormatFn }>) {
  const isPositive = remaining >= 0;
  const display = describeRemaining(remaining, fmt);
  return (
    <StatCard
      label="Remaining"
      value={display.value}
      valueClassName={display.tone}
      subtitle={isPositive ? 'Under budget' : 'Over budget'}
      icon={isPositive ? CheckCircle2 : AlertTriangle}
      color={isPositive ? 'emerald' : 'rose'}
    />
  );
}

function SavingsRateCard({ savingsRate }: Readonly<{ savingsRate: number }>) {
  const { numberFormat } = useCurrency();
  return (
    <StatCard
      label="Savings rate"
      value={formatPercent(savingsRate, numberFormat, 1)}
      subtitle="of monthly budget"
      icon={CheckCircle2}
      color="sky"
    />
  );
}

export function BudgetSummaryCards({
  totalBudgeted,
  totalSpent,
  remaining,
  savingsRate,
  fmt,
}: Readonly<BudgetSummaryCardsProps>) {
  return (
    <StatsGrid>
      <TotalBudgetCard totalBudgeted={totalBudgeted} fmt={fmt} />
      <TotalSpentCard totalBudgeted={totalBudgeted} totalSpent={totalSpent} fmt={fmt} />
      <RemainingCard remaining={remaining} fmt={fmt} />
      <SavingsRateCard savingsRate={savingsRate} />
    </StatsGrid>
  );
}

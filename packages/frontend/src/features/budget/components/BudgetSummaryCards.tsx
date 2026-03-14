import { AlertTriangle, CheckCircle2, TrendingDown, Wallet } from 'lucide-react';
import { StatCard, StatsGrid } from '@/components/ui';
import type { BudgetFormatFn } from '../types';

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
      label="Total Spent"
      value={fmt(totalSpent)}
      subtitle={`${totalBudgeted > 0 ? ((totalSpent / totalBudgeted) * 100).toFixed(0) : 0}% of budget`}
      icon={TrendingDown}
      color="rose"
    />
  );
}

function RemainingCard({ remaining, fmt }: Readonly<{ remaining: number; fmt: BudgetFormatFn }>) {
  const isPositive = remaining >= 0;
  return (
    <StatCard
      label="Remaining"
      value={`${isPositive ? '+' : ''}${fmt(remaining)}`}
      valueClassName={isPositive ? 'text-emerald-600' : 'text-rose-500'}
      subtitle={isPositive ? 'Under budget' : 'Over budget'}
      icon={isPositive ? CheckCircle2 : AlertTriangle}
      color={isPositive ? 'emerald' : 'rose'}
      className={isPositive ? undefined : 'border-rose-200'}
    />
  );
}

function SavingsRateCard({ savingsRate }: Readonly<{ savingsRate: number }>) {
  return (
    <StatCard
      label="Savings Rate"
      value={`${savingsRate.toFixed(1)}%`}
      valueClassName="text-sky-600"
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

import { StatCard, StatsGrid } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { Percent, PiggyBank, TrendingUp } from 'lucide-react';
import { formatPercent, type SavingsAccount, type SavingsTransaction } from '@quro/shared';
import type { SavingsFormatFn } from '../types';

type SavingsStatsProps = {
  totalInBase: number;
  totalInterest: number;
  avgRate: number;
  accounts: SavingsAccount[];
  transactions: SavingsTransaction[];
  fmtBase: SavingsFormatFn;
};

// The totals count joint accounts at your share; the account rows show full balances.
export function SavingsStats({
  totalInBase,
  totalInterest,
  avgRate,
  accounts,
  transactions,
  fmtBase,
}: Readonly<SavingsStatsProps>) {
  const { numberFormat } = useCurrency();
  const currencyCount = new Set(accounts.map((account) => account.currency)).size;
  return (
    <StatsGrid className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
      <StatCard
        label="Total savings (your share)"
        value={fmtBase(totalInBase)}
        icon={PiggyBank}
        color="indigo"
        valueClassName="text-figure-hero"
        subtitle={`Across ${accounts.length} accounts · ${currencyCount} currencies · ${transactions.length} transactions`}
      />
      <StatCard
        label="Average interest rate"
        value={formatPercent(avgRate, numberFormat, 2)}
        icon={Percent}
        color="emerald"
        subtitle="Weighted average APY"
      />
      <StatCard
        label="Monthly interest (your share)"
        value={fmtBase(totalInterest, undefined, true)}
        icon={TrendingUp}
        color="sky"
        subtitle={`≈ ${fmtBase(totalInterest * 12)} per year`}
      />
    </StatsGrid>
  );
}

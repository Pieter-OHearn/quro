import { StatCard, StatsGrid } from '@/components/ui';
import { ArrowUpRight, Percent, PiggyBank, TrendingUp } from 'lucide-react';
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

export function SavingsStats({
  totalInBase,
  totalInterest,
  avgRate,
  accounts,
  transactions,
  fmtBase,
}: Readonly<SavingsStatsProps>) {
  return (
    <StatsGrid className="grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
      <StatCard
        label="Total Savings"
        value={fmtBase(totalInBase)}
        icon={PiggyBank}
        color="indigo"
        layout="inline"
        valueClassName="text-2xl font-numeric"
        subtitle={
          <>
            <div className="flex items-center gap-1 text-success">
              <ArrowUpRight size={12} />
              <span>across {accounts.length} accounts</span>
            </div>
            <p className="mt-0.5">
              {new Set(accounts.map((account) => account.currency)).size} currencies ·{' '}
              {transactions.length} transactions
            </p>
          </>
        }
      />
      <StatCard
        label="Avg. Interest Rate"
        value={formatPercent(avgRate, 2)}
        icon={Percent}
        color="emerald"
        layout="inline"
        valueClassName="text-2xl font-numeric"
        subtitle="Weighted average APY"
      />
      <StatCard
        label="Monthly Interest"
        value={fmtBase(totalInterest, undefined, true)}
        icon={TrendingUp}
        color="sky"
        layout="inline"
        valueClassName="text-2xl font-numeric"
        subtitle={`≈ ${fmtBase(totalInterest * 12)} per year`}
      />
    </StatsGrid>
  );
}

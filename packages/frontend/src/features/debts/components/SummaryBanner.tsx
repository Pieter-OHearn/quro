import { useMemo } from 'react';
import type { Debt } from '@quro/shared';
import { TrendingDown } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import { buildDebtOverview } from '../utils/debt-metrics';

export function SummaryBanner({ debts }: Readonly<{ debts: readonly Debt[] }>) {
  const { fmtBase, convertToBase } = useCurrency();
  const overview = useMemo(() => buildDebtOverview(debts, convertToBase), [debts, convertToBase]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0a0f1e] via-[#1a0a1e] to-[#1e0a14] p-6 text-white">
      <div className="absolute -right-10 -top-14 h-64 w-64 rounded-full bg-rose-500/10" />
      <div className="absolute bottom-0 left-20 h-44 w-44 translate-y-1/2 rounded-full bg-indigo-500/10" />
      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-rose-300">
            <TrendingDown size={16} className="text-rose-400" />
            <span className="text-sm font-medium">Liabilities Overview</span>
          </div>
          <p className="text-3xl font-bold">{fmtBase(overview.totalBalance)}</p>
          <p className="mt-1 text-sm text-slate-400">
            Total outstanding across {overview.debtCount} debt
            {overview.debtCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Monthly Payments', value: fmtBase(overview.totalMonthlyPayment), icon: '📅' },
            {
              label: 'Avg Interest',
              value: `${overview.averageInterestRate.toFixed(2)}% APR`,
              icon: '📊',
            },
            {
              label: 'Highest Rate',
              value: `${overview.highestInterestRate.toFixed(2)}% APR`,
              icon: '⚠️',
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl bg-white/8 px-4 py-3 text-center backdrop-blur-sm"
            >
              <p className="text-lg">{metric.icon}</p>
              <p className="text-sm font-bold text-white">{metric.value}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

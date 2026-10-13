import { useMemo } from 'react';
import { formatPercent, type Debt } from '@quro/shared';
import { Card } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { formatAsNegative } from '@/lib/liability';
import { buildDebtOverview } from '../utils/debt-metrics';

export function SummaryBanner({ debts }: Readonly<{ debts: readonly Debt[] }>) {
  const { fmtBase, convertToBase, numberFormat } = useCurrency();
  const overview = useMemo(() => buildDebtOverview(debts, convertToBase), [debts, convertToBase]);
  const metrics = [
    { label: 'Monthly Payments', value: fmtBase(overview.totalMonthlyPayment) },
    {
      label: 'Avg Interest',
      value: `${formatPercent(overview.averageInterestRate, numberFormat, 2)} APR`,
    },
    {
      label: 'Highest Rate',
      value: `${formatPercent(overview.highestInterestRate, numberFormat, 2)} APR`,
    },
  ];

  return (
    <Card className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-label text-fg-muted">Liabilities Overview</p>
        <p className="mt-1 text-figure-hero font-numeric text-fg">
          {formatAsNegative(fmtBase, overview.totalBalance)}
        </p>
        <p className="text-caption text-fg-subtle">
          Total outstanding across {overview.debtCount} debt
          {overview.debtCount === 1 ? '' : 's'}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-4 border-t border-border-subtle pt-3 md:border-t-0 md:pt-0">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 md:text-right">
            <dt className="text-label text-fg-muted">{metric.label}</dt>
            <dd className="mt-0.5 text-figure-md font-numeric text-fg">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

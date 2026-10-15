import { AreaChartCard } from '@/components/ui';
import type { AllocationItem, DashboardFormatFn, NetWorthMetricData } from '../types';
import { AssetAllocationCard } from './AssetAllocationCard';

export function DashboardChartsGrid({
  chartData,
  allocationData,
  totalAlloc,
  liabilitiesTotal,
  debtCount,
  netWorth,
  baseCurrency,
  fmtBase,
}: Readonly<{
  chartData: readonly NetWorthMetricData[];
  allocationData: readonly AllocationItem[];
  totalAlloc: number;
  liabilitiesTotal: number;
  debtCount: number;
  netWorth: number;
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2">
        <AreaChartCard
          className="h-full"
          title="Net worth growth"
          subtitle={`Last 7 months in ${baseCurrency}`}
          data={chartData}
          dataKey="value"
          estimatedKey="isEstimated"
          xKey="month"
          color="var(--brand)"
          height={220}
          formatValue={fmtBase}
          emptyMessage="No net worth data yet."
        />
      </div>
      <AssetAllocationCard
        allocationData={allocationData}
        totalAlloc={totalAlloc}
        liabilitiesTotal={liabilitiesTotal}
        debtCount={debtCount}
        netWorth={netWorth}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
    </div>
  );
}

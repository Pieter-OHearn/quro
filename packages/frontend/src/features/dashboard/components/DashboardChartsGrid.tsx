import { AreaChartCard } from '@/components/ui';
import type { AllocationItem, DashboardFormatFn, NetWorthMetricData } from '../types';
import { AssetAllocationCard } from './AssetAllocationCard';

export function DashboardChartsGrid({
  chartData,
  allocationData,
  totalAlloc,
  liabilitiesTotal,
  baseCurrency,
  ytdPct,
  fmtBase,
}: Readonly<{
  chartData: readonly NetWorthMetricData[];
  allocationData: readonly AllocationItem[];
  totalAlloc: number;
  liabilitiesTotal: number;
  baseCurrency: string;
  ytdPct: number;
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
      <div className="lg:col-span-2">
        <AreaChartCard
          className="h-full"
          title="Net Worth Growth"
          subtitle={`Last 7 months in ${baseCurrency}`}
          data={chartData}
          dataKey="value"
          xKey="month"
          color="#6366f1"
          height={220}
          formatValue={fmtBase}
          badge={
            ytdPct !== 0 ? (
              <span
                className={`text-xs px-3 py-1 rounded-full font-medium ${ytdPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
              >
                {ytdPct >= 0 ? '+' : ''}
                {ytdPct.toFixed(1)}% YTD
              </span>
            ) : undefined
          }
          emptyMessage="No net worth data yet."
        />
      </div>
      <AssetAllocationCard
        allocationData={allocationData}
        totalAlloc={totalAlloc}
        liabilitiesTotal={liabilitiesTotal}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
    </div>
  );
}

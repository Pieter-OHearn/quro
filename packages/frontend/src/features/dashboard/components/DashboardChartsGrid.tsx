import type { NetWorthSnapshot } from '@quro/shared';
import type { AllocationItem, DashboardFormatFn } from '../types';
import { AssetAllocationCard } from './AssetAllocationCard';
import { NetWorthChartCard } from './NetWorthChartCard';

export function DashboardChartsGrid({
  netWorthHistory,
  convertToBase,
  allocationData,
  totalAlloc,
  liabilitiesTotal,
  debtCount,
  netWorth,
  baseCurrency,
  fmtBase,
}: Readonly<{
  netWorthHistory: readonly NetWorthSnapshot[];
  convertToBase: (amount: number, currency: string) => number;
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
        <NetWorthChartCard
          defaultHistory={netWorthHistory}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
          convertToBase={convertToBase}
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

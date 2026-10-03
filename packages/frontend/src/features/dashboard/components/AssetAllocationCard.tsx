import { Cell, Pie, PieChart } from 'recharts';
import { Link } from 'react-router';
import type { AllocationItem, DashboardFormatFn } from '../types';

export function AllocationPieChart({ data }: Readonly<{ data: readonly AllocationItem[] }>) {
  return (
    <div className="flex justify-center mb-4">
      <PieChart width={160} height={160}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={75}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.key} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
    </div>
  );
}

function AllocationLegend({
  data,
  totalAlloc,
  fmtBase,
}: Readonly<{
  data: readonly AllocationItem[];
  totalAlloc: number;
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.key} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-fg-muted">{item.name}</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-fg-emphasis">{fmtBase(item.value)}</span>
            <span className="text-[10px] text-fg-faint ml-1">
              {totalAlloc > 0 ? ((item.value / totalAlloc) * 100).toFixed(0) : 0}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssetAllocationCard({
  allocationData,
  totalAlloc,
  liabilitiesTotal,
  netWorth,
  baseCurrency,
  fmtBase,
}: Readonly<{
  allocationData: readonly AllocationItem[];
  totalAlloc: number;
  liabilitiesTotal: number;
  netWorth: number;
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
}>) {
  const hasAssets = allocationData.length > 0;

  return (
    <div className="bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm h-full">
      <h3 className="font-semibold text-fg mb-1">Asset Allocation</h3>
      <p className="text-xs text-fg-faint mb-4">All values in {baseCurrency}</p>
      {hasAssets ? (
        <>
          <AllocationPieChart data={allocationData} />
          <AllocationLegend data={allocationData} totalAlloc={totalAlloc} fmtBase={fmtBase} />
        </>
      ) : (
        <p className="py-12 text-center text-sm text-fg-faint">No asset allocation data yet.</p>
      )}
      {hasAssets || liabilitiesTotal > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="border-t border-border-subtle" />
          {liabilitiesTotal > 0 ? (
            <Link to="/debts" className="group flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-danger-muted" />
                <span className="text-xs text-danger transition-colors group-hover:text-danger-fg">
                  Liabilities
                </span>
              </div>
              <span className="text-xs font-semibold text-danger">
                -{fmtBase(liabilitiesTotal)}
              </span>
            </Link>
          ) : null}
          <div className="flex items-center justify-between border-t border-border-subtle pt-2">
            <span className="text-xs font-semibold text-fg-strong">Net Worth</span>
            <span className="text-xs font-bold text-fg">{fmtBase(netWorth)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

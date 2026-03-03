import { Cell, Pie, PieChart } from 'recharts';
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
            <Cell key={entry.name} fill={entry.color} />
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
        <div key={item.name} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-slate-600">{item.name}</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold text-slate-800">{fmtBase(item.value)}</span>
            <span className="text-[10px] text-slate-400 ml-1">
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
  baseCurrency,
  fmtBase,
}: Readonly<{
  allocationData: readonly AllocationItem[];
  totalAlloc: number;
  baseCurrency: string;
  fmtBase: DashboardFormatFn;
}>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm h-full">
      <h3 className="font-semibold text-slate-900 mb-1">Asset Allocation</h3>
      <p className="text-xs text-slate-400 mb-4">All values in {baseCurrency}</p>
      {allocationData.length > 0 ? (
        <>
          <AllocationPieChart data={allocationData} />
          <AllocationLegend data={allocationData} totalAlloc={totalAlloc} fmtBase={fmtBase} />
        </>
      ) : (
        <p className="text-sm text-slate-400 py-12 text-center">No allocation data yet.</p>
      )}
    </div>
  );
}

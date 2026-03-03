import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import type { BudgetFormatFn, PieEntry } from '../types';

type SpendingPieChartProps = {
  pieData: readonly PieEntry[];
  fmtDec: BudgetFormatFn;
};

export function SpendingPieChart({ pieData, fmtDec }: Readonly<SpendingPieChartProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Spending Breakdown</h3>
      <p className="text-xs text-slate-400 mb-4">Current month</p>
      {pieData.length > 0 ? (
        <>
          <div className="flex justify-center">
            <PieChart width={180} height={180}>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={50}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => fmtDec(value)}
                contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
              />
            </PieChart>
          </div>
          <div className="space-y-1.5 mt-2">
            {pieData.slice(0, 5).map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-slate-600">{item.name}</span>
                </div>
                <span className="text-xs font-semibold text-slate-800">{fmtDec(item.value)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400 py-12 text-center">No spending data yet.</p>
      )}
    </div>
  );
}

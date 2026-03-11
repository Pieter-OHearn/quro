import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BudgetCategory, BudgetFormatFn } from '../types';

type BudgetVsSpentChartProps = {
  categories: readonly BudgetCategory[];
  fmt: BudgetFormatFn;
};

export function BudgetVsSpentChart({ categories, fmt }: Readonly<BudgetVsSpentChartProps>) {
  return (
    <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Budget vs Spent</h3>
      <p className="text-xs text-slate-400 mb-5">Category breakdown</p>
      {categories.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={categories.map((category) => ({
              name: category.name,
              budgeted: category.budgeted,
              spent: category.spent,
            }))}
            barSize={14}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              angle={-30}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => fmt(value)}
            />
            <Tooltip
              formatter={(value, name) => [
                fmt(Number(value) || 0),
                String(name) === 'budgeted' ? 'Budgeted' : 'Spent',
              ]}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
            />
            <Bar dataKey="budgeted" name="budgeted" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="spent" name="spent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-slate-400 py-12 text-center">No budget categories yet.</p>
      )}
    </div>
  );
}

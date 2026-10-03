import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BudgetCategory, BudgetFormatFn } from '../types';

type BudgetVsSpentChartProps = {
  categories: readonly BudgetCategory[];
  fmt: BudgetFormatFn;
};

export function BudgetVsSpentChart({ categories, fmt }: Readonly<BudgetVsSpentChartProps>) {
  return (
    <div className="lg:col-span-2 bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm">
      <h3 className="font-semibold text-fg mb-1">Budget vs Spent</h3>
      <p className="text-xs text-fg-faint mb-5">Category breakdown</p>
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: 'var(--data-neutral)' }}
              axisLine={false}
              tickLine={false}
              angle={-30}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--data-neutral)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => fmt(value)}
            />
            <Tooltip
              formatter={(value, name) => [
                fmt(Number(value) || 0),
                String(name) === 'budgeted' ? 'Budgeted' : 'Spent',
              ]}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid var(--border-default)',
                fontSize: '12px',
              }}
            />
            <Bar
              dataKey="budgeted"
              name="budgeted"
              fill="var(--data-primary)"
              radius={[4, 4, 0, 0]}
            />
            <Bar dataKey="spent" name="spent" fill="var(--data-expense)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-fg-faint py-12 text-center">No budget categories yet.</p>
      )}
    </div>
  );
}

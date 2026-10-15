import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/ui';
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_PROPS } from '@/lib/chartStyles';
import type { BudgetCategory, BudgetFormatFn } from '../types';

// The budget is the grey reference; spending is the blue series beside it.
const BUDGETED_COLOR = 'var(--viz-6)';
const SPENT_COLOR = 'var(--viz-2)';

type BudgetVsSpentChartProps = {
  categories: readonly BudgetCategory[];
  fmt: BudgetFormatFn;
};

function BudgetVsSpentLegend() {
  return (
    <div className="mt-2 flex items-center gap-4">
      {[
        { label: 'Budgeted', color: BUDGETED_COLOR },
        { label: 'Spent', color: SPENT_COLOR },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-caption text-fg-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function BudgetVsSpentChart({ categories, fmt }: Readonly<BudgetVsSpentChartProps>) {
  return (
    <ChartCard
      title="Budget vs spent"
      subtitle="Category breakdown"
      hasData={categories.length > 0}
      emptyMessage="No budget categories yet."
      className="lg:col-span-2"
      footer={<BudgetVsSpentLegend />}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={categories.map((category) => ({
            name: category.name,
            budgeted: category.budgeted,
            spent: category.spent,
          }))}
          barSize={14}
        >
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="name" {...CHART_AXIS_PROPS} angle={-30} textAnchor="end" height={60} />
          <YAxis {...CHART_AXIS_PROPS} tickFormatter={(value) => fmt(value)} />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            formatter={(value, name) => [
              fmt(Number(value) || 0),
              String(name) === 'budgeted' ? 'Budgeted' : 'Spent',
            ]}
          />
          <Bar dataKey="budgeted" name="budgeted" fill={BUDGETED_COLOR} />
          <Bar dataKey="spent" name="spent" fill={SPENT_COLOR} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

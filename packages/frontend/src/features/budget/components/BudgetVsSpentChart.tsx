import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, buildChartAlternative } from '@/components/ui';
import { ChartLegend } from '@/components/finance/chartTheme';
import {
  CHART_GRID_PROPS,
  CHART_TOOLTIP_PROPS,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
  formatAxisCompact,
} from '@/lib/chartStyles';
import { useChartMotion } from '@/hooks/useMediaQuery';
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
    <ChartLegend
      items={[
        { label: 'Budgeted', color: BUDGETED_COLOR, swatch: 'soft' },
        { label: 'Spent', color: SPENT_COLOR, swatch: 'solid' },
      ]}
    />
  );
}

export function BudgetVsSpentChart({ categories, fmt }: Readonly<BudgetVsSpentChartProps>) {
  const motion = useChartMotion();
  return (
    <ChartCard
      title="Budget vs spent"
      subtitle="Category breakdown"
      hasData={categories.length > 0}
      emptyMessage="No budget categories yet."
      className="lg:col-span-2"
      footer={<BudgetVsSpentLegend />}
      alternative={buildChartAlternative({
        subject: 'Budget vs spent',
        xLabel: 'Category',
        x: (category) => category.name,
        rows: categories,
        ordered: false,
        columns: [
          { label: 'Budgeted', value: (category) => category.budgeted, format: fmt },
          { label: 'Spent', value: (category) => category.spent, format: fmt },
        ],
      })}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={categories.map((category) => ({
            name: category.name,
            budgeted: category.budgeted,
            spent: category.spent,
          }))}
          barSize={14}
          accessibilityLayer
        >
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="name" {...CHART_X_AXIS_PROPS} angle={-30} textAnchor="end" height={60} />
          <YAxis {...CHART_Y_AXIS_PROPS} tickFormatter={(value) => formatAxisCompact(value)} />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            {...motion}
            formatter={(value, name) => [
              fmt(Number(value) || 0),
              String(name) === 'budgeted' ? 'Budgeted' : 'Spent',
            ]}
          />
          <Bar
            dataKey="budgeted"
            name="budgeted"
            fill={BUDGETED_COLOR}
            fillOpacity={0.3}
            stroke={BUDGETED_COLOR}
            {...motion}
          />
          <Bar dataKey="spent" name="spent" fill={SPENT_COLOR} {...motion} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

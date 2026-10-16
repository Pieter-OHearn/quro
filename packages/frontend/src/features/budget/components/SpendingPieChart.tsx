import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { ChartCard, buildChartAlternative } from '@/components/ui';
import { useChartMotion } from '@/hooks/useMediaQuery';
import { CHART_TOOLTIP_PROPS } from '@/lib/chartStyles';
import { dataColorToken } from '@/lib/dataColors';
import type { BudgetFormatFn, PieEntry } from '../types';

type SpendingPieChartProps = {
  pieData: readonly PieEntry[];
  fmtDec: BudgetFormatFn;
};

// Each slice keeps its category's colour, so the chart matches the category list.
const shareOf = (value: number, total: number): string =>
  total > 0 ? `${Math.round((value / total) * 100)}%` : '0%';

export function SpendingPieChart({ pieData, fmtDec }: Readonly<SpendingPieChartProps>) {
  const motion = useChartMotion();
  const total = pieData.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <ChartCard
      title="Spending breakdown"
      subtitle="Current month"
      hasData={pieData.length > 0}
      emptyMessage="No spending data yet."
      alternative={buildChartAlternative({
        subject: 'Spending breakdown for the current month',
        xLabel: 'Category',
        x: (entry) => entry.name,
        rows: pieData,
        ordered: false,
        columns: [
          { label: 'Spent', value: (entry) => entry.value, format: fmtDec },
          { label: 'Share', value: (entry) => entry.value, format: (v) => shareOf(v, total) },
        ],
      })}
    >
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
            stroke="var(--surface)"
            {...motion}
          >
            {pieData.map((entry) => (
              <Cell key={entry.name} fill={dataColorToken(entry.color)} />
            ))}
          </Pie>
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            {...motion}
            formatter={(value) => fmtDec(Number(value) || 0)}
          />
        </PieChart>
      </div>
      <ul className="mt-2 space-y-1">
        {pieData.slice(0, 5).map((item) => (
          <li key={item.name} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: dataColorToken(item.color) }}
                aria-hidden
              />
              <span className="truncate text-cell text-fg-muted">{item.name}</span>
            </div>
            <span className="text-cell font-medium font-numeric text-fg">
              {fmtDec(item.value)}
              <span className="ml-2 inline-block w-9 text-right font-normal text-fg-muted">
                {shareOf(item.value, total)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

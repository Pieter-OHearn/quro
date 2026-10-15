import { Change, ChartCard } from '@/components/ui';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_AXIS_PROPS,
  CHART_CURSOR,
  CHART_GRID_PROPS,
  ChartTooltipContent,
} from '@/components/finance/chartTheme';
import type { PensionFormatBaseFn, PensionGrowthPoint } from '../types';

// Pension is the third chart series colour.
const PENSION_SERIES = 'var(--viz-3)';

type PensionGrowthChartProps = {
  pensionGrowthData: PensionGrowthPoint[];
  pensionGrowthPct: number | null;
  fmtBase: PensionFormatBaseFn;
  baseCurrency: string;
};

function PensionGrowthAreaChart({
  data,
  fmtBase,
}: Readonly<{ data: PensionGrowthPoint[]; fmtBase: PensionFormatBaseFn }>) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis dataKey="year" {...CHART_AXIS_PROPS} />
        <YAxis
          {...CHART_AXIS_PROPS}
          tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
        />
        <Tooltip
          cursor={CHART_CURSOR}
          content={(props) => (
            <ChartTooltipContent
              active={props.active}
              label={props.label as string | undefined}
              payload={props.payload}
              formatEntry={(entry) => ({
                name: 'Pension value',
                value: fmtBase(Number(entry.value) || 0),
              })}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={PENSION_SERIES}
          strokeWidth={2}
          fill={PENSION_SERIES}
          fillOpacity={0.12}
          dot={false}
          activeDot={{ r: 4, fill: PENSION_SERIES, stroke: 'var(--surface)', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PensionGrowthChart({
  pensionGrowthData,
  pensionGrowthPct,
  fmtBase,
  baseCurrency,
}: Readonly<PensionGrowthChartProps>) {
  return (
    <ChartCard
      title="Total pension growth"
      subtitle={`Combined value across all pots (${baseCurrency})`}
      badge={
        pensionGrowthPct !== null && pensionGrowthData.length > 0 ? (
          <span className="flex items-baseline gap-1 text-caption text-fg-subtle">
            <Change value={pensionGrowthPct} format="percent" />
            since {pensionGrowthData[0].year}
          </span>
        ) : undefined
      }
      hasData={pensionGrowthData.length > 0}
      emptyMessage="Add pension transactions to generate growth history."
    >
      {pensionGrowthData.length > 0 && (
        <PensionGrowthAreaChart data={pensionGrowthData} fmtBase={fmtBase} />
      )}
    </ChartCard>
  );
}

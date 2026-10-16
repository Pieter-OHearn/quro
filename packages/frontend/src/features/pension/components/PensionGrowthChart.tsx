import { Change, ChartCard, buildChartAlternative } from '@/components/ui';
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
  CHART_CURSOR,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_WRAPPER_STYLE,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
  ChartTooltipContent,
} from '@/components/finance/chartTheme';
import { formatAxisCompact } from '@/lib/chartStyles';
import { useChartMotion } from '@/hooks/useMediaQuery';
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
  const motion = useChartMotion();
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis dataKey="year" {...CHART_X_AXIS_PROPS} />
        <YAxis
          {...CHART_Y_AXIS_PROPS}
          tickFormatter={(value) => formatAxisCompact(Number(value))}
        />
        <Tooltip
          {...motion}
          wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
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
          {...motion}
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
      alternative={buildChartAlternative({
        subject: 'Total pension growth',
        xLabel: 'Year',
        x: (point) => point.year,
        rows: pensionGrowthData,
        columns: [{ label: 'Pension value', value: (point) => point.value, format: fmtBase }],
      })}
    >
      {pensionGrowthData.length > 0 && (
        <PensionGrowthAreaChart data={pensionGrowthData} fmtBase={fmtBase} />
      )}
    </ChartCard>
  );
}

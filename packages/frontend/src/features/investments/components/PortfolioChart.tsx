import { ChartCard, buildChartAlternative } from '@/components/ui';
import { formatAxisCompact } from '@/lib/chartStyles';
import { useChartMotion } from '@/hooks/useMediaQuery';
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
  ChartLegend,
  ChartTooltipContent,
  type ChartTooltipEntry,
} from '@/components/finance/chartTheme';
import type { PortfolioHistoryPoint } from '../types';

// Series colours by asset class: investments and property.
const BROKERAGE_SERIES = 'var(--viz-2)';
const PROPERTY_SERIES = 'var(--viz-4)';
const SERIES_FILL_OPACITY = 0.08;
// Property is dashed, so the two lines differ by more than hue.
const PROPERTY_DASH = '6 4';

type PortfolioChartProps = {
  data: PortfolioHistoryPoint[];
  baseCurrency: string;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
};

type PortfolioAreaChartProps = {
  data: PortfolioHistoryPoint[];
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
};

function isEstimatedPoint(entry: ChartTooltipEntry): boolean {
  const payload = entry.payload as { isEstimated?: boolean } | undefined;
  return Boolean(payload?.isEstimated);
}

function seriesName(entry: ChartTooltipEntry): string {
  if (entry.dataKey !== 'brokerage') return 'Your property equity';
  return isEstimatedPoint(entry) ? 'Brokerage (estimated)' : 'Brokerage';
}

function activeDot(color: string) {
  return { r: 4, fill: color, stroke: 'var(--surface)', strokeWidth: 2 };
}

function PortfolioAreaChart({ data, fmtBase }: PortfolioAreaChartProps) {
  const motion = useChartMotion();
  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" {...CHART_X_AXIS_PROPS} />
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
                  name: seriesName(entry),
                  value: fmtBase(Number(entry.value) || 0),
                })}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="propertyEquity"
            stroke={PROPERTY_SERIES}
            strokeWidth={2}
            strokeDasharray={PROPERTY_DASH}
            fill={PROPERTY_SERIES}
            fillOpacity={SERIES_FILL_OPACITY}
            dot={false}
            activeDot={activeDot(PROPERTY_SERIES)}
            {...motion}
          />
          <Area
            type="monotone"
            dataKey="brokerage"
            stroke={BROKERAGE_SERIES}
            strokeWidth={2}
            fill={BROKERAGE_SERIES}
            fillOpacity={SERIES_FILL_OPACITY}
            dot={false}
            activeDot={activeDot(BROKERAGE_SERIES)}
            {...motion}
          />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: 'Brokerage', color: BROKERAGE_SERIES },
          { label: 'Your property equity', color: PROPERTY_SERIES, dashed: true },
        ]}
        note="Estimated where historical market prices are unavailable."
      />
    </>
  );
}

export function PortfolioChart({ data, baseCurrency, fmtBase }: PortfolioChartProps) {
  return (
    <ChartCard
      title="Portfolio performance"
      subtitle={`Brokerage + your property equity in ${baseCurrency}`}
      hasData={data.length > 0}
      emptyMessage="Add transactions to generate portfolio history."
      alternative={buildChartAlternative({
        subject: 'Portfolio performance',
        xLabel: 'Month',
        x: (point) => point.month,
        rows: data,
        columns: [
          { label: 'Brokerage', value: (point) => point.brokerage, format: fmtBase },
          {
            label: 'Your property equity',
            value: (point) => point.propertyEquity,
            format: fmtBase,
          },
        ],
        estimated: (point) => point.isEstimated,
        note: 'Estimated rows use fallback market prices for the brokerage value.',
      })}
    >
      {data.length > 0 && <PortfolioAreaChart data={data} fmtBase={fmtBase} />}
    </ChartCard>
  );
}

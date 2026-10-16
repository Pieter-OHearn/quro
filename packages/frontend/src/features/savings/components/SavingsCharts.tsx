import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard, buildChartAlternative } from '@/components/ui';
import { formatAxisCompact } from '@/lib/chartStyles';
import { useChartMotion } from '@/hooks/useMediaQuery';
import {
  CHART_BAR_CURSOR,
  CHART_CURSOR,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_WRAPPER_STYLE,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
  ChartLegend,
  ChartTooltipContent,
} from '@/components/finance/chartTheme';
import type { SavingsChartDatum, SavingsContributionDatum, SavingsFormatFn } from '../types';

// Savings is the first chart series colour; interest is the same colour at a lighter weight.
const SAVINGS_SERIES = 'var(--viz-1)';
const INTEREST_OPACITY = 0.45;
const CHART_HEIGHT = 200;
const BAR_CORNER = 2;
const BAR_RADIUS: [number, number, number, number] = [BAR_CORNER, BAR_CORNER, 0, 0];

type SavingsChartsProps = {
  growthChartData: SavingsChartDatum[];
  contribChartData: SavingsContributionDatum[];
  baseCurrency: string;
  fmtBase: SavingsFormatFn;
};

type GrowthChartProps = Pick<SavingsChartsProps, 'growthChartData' | 'baseCurrency' | 'fmtBase'>;

function GrowthChart({ growthChartData, baseCurrency, fmtBase }: Readonly<GrowthChartProps>) {
  const motion = useChartMotion();
  return (
    <ChartCard
      title="Savings growth"
      subtitle={`Total balance in ${baseCurrency}`}
      hasData={growthChartData.length > 0}
      alternative={buildChartAlternative({
        subject: 'Savings growth',
        xLabel: 'Month',
        x: (point) => point.month,
        rows: growthChartData,
        columns: [{ label: 'Total savings', value: (point) => point.savings, format: fmtBase }],
      })}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={growthChartData} accessibilityLayer>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" {...CHART_X_AXIS_PROPS} />
          <YAxis {...CHART_Y_AXIS_PROPS} tickFormatter={(value) => formatAxisCompact(value)} />
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
                  name: 'Total savings',
                  value: fmtBase(Number(entry.value) || 0),
                })}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="savings"
            stroke={SAVINGS_SERIES}
            strokeWidth={2}
            fill={SAVINGS_SERIES}
            fillOpacity={0.12}
            dot={false}
            {...motion}
            activeDot={{ r: 4, fill: SAVINGS_SERIES, stroke: 'var(--surface)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

type ContribChartProps = Pick<SavingsChartsProps, 'contribChartData' | 'baseCurrency' | 'fmtBase'>;

function contribSeriesName(dataKey: unknown): string {
  return dataKey === 'contribution' ? 'Net contributions' : 'Interest';
}

function ContribChart({ contribChartData, baseCurrency, fmtBase }: Readonly<ContribChartProps>) {
  const motion = useChartMotion();
  return (
    <ChartCard
      title="Contributions vs interest"
      subtitle={`Monthly totals in ${baseCurrency}`}
      hasData={contribChartData.length > 0}
      alternative={buildChartAlternative({
        subject: 'Contributions vs interest',
        xLabel: 'Month',
        x: (point) => point.month,
        rows: contribChartData,
        columns: [
          { label: 'Net contributions', value: (point) => point.contribution, format: fmtBase },
          { label: 'Interest', value: (point) => point.interest, format: fmtBase },
        ],
      })}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={contribChartData} barSize={18} accessibilityLayer>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" {...CHART_X_AXIS_PROPS} />
          <YAxis {...CHART_Y_AXIS_PROPS} tickFormatter={(value) => formatAxisCompact(value)} />
          <Tooltip
            {...motion}
            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
            cursor={CHART_BAR_CURSOR}
            content={(props) => (
              <ChartTooltipContent
                active={props.active}
                label={props.label as string | undefined}
                payload={props.payload}
                formatEntry={(entry) => ({
                  name: contribSeriesName(entry.dataKey),
                  value: fmtBase(Number(entry.value) || 0),
                })}
              />
            )}
          />
          <Bar dataKey="contribution" fill={SAVINGS_SERIES} radius={BAR_RADIUS} {...motion} />
          <Bar
            dataKey="interest"
            fill={SAVINGS_SERIES}
            fillOpacity={INTEREST_OPACITY}
            stroke={SAVINGS_SERIES}
            radius={BAR_RADIUS}
            {...motion}
          />
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: 'Net contributions', color: SAVINGS_SERIES, swatch: 'solid' },
          { label: 'Interest', color: SAVINGS_SERIES, swatch: 'soft' },
        ]}
      />
    </ChartCard>
  );
}

export function SavingsCharts({
  growthChartData,
  contribChartData,
  baseCurrency,
  fmtBase,
}: Readonly<SavingsChartsProps>) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GrowthChart
        growthChartData={growthChartData}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
      <ContribChart
        contribChartData={contribChartData}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
      />
    </div>
  );
}

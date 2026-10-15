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
import { ChartCard } from '@/components/ui';
import {
  CHART_AXIS_PROPS,
  CHART_BAR_CURSOR,
  CHART_CURSOR,
  CHART_GRID_PROPS,
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
  return (
    <ChartCard
      title="Savings growth"
      subtitle={`Total balance in ${baseCurrency}`}
      hasData={growthChartData.length > 0}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={growthChartData}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" {...CHART_AXIS_PROPS} />
          <YAxis {...CHART_AXIS_PROPS} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
          <Tooltip
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
  return (
    <ChartCard
      title="Contributions vs interest"
      subtitle={`Monthly totals in ${baseCurrency}`}
      hasData={contribChartData.length > 0}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={contribChartData} barSize={18}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" {...CHART_AXIS_PROPS} />
          <YAxis {...CHART_AXIS_PROPS} tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`} />
          <Tooltip
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
          <Bar dataKey="contribution" fill={SAVINGS_SERIES} radius={BAR_RADIUS} />
          <Bar
            dataKey="interest"
            fill={SAVINGS_SERIES}
            fillOpacity={INTEREST_OPACITY}
            radius={BAR_RADIUS}
          />
        </BarChart>
      </ResponsiveContainer>
      <ChartLegend
        items={[
          { label: 'Net contributions', color: SAVINGS_SERIES },
          { label: 'Interest', color: SAVINGS_SERIES, opacity: INTEREST_OPACITY },
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

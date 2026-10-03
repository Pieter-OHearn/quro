import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SavingsChartDatum, SavingsContributionDatum, SavingsFormatFn } from '../types';

type SavingsChartsProps = {
  growthChartData: SavingsChartDatum[];
  contribChartData: SavingsContributionDatum[];
  baseCurrency: string;
  fmtBase: SavingsFormatFn;
};

type GrowthChartProps = Pick<SavingsChartsProps, 'growthChartData' | 'baseCurrency' | 'fmtBase'>;

function GrowthChart({ growthChartData, baseCurrency, fmtBase }: Readonly<GrowthChartProps>) {
  return (
    <div className="bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm">
      <h3 className="font-semibold text-fg mb-1">Savings Growth</h3>
      <p className="text-xs text-fg-faint mb-5">Total balance in {baseCurrency}</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={growthChartData}>
          <defs>
            <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--data-primary)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--data-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--data-neutral)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--data-neutral)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value) => [fmtBase(Number(value) || 0), 'Total Savings']}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid var(--border-default)',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="savings"
            stroke="var(--data-primary)"
            strokeWidth={2.5}
            fill="url(#savingsGrad)"
            dot={{ r: 3, fill: 'var(--data-primary)' }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type ContribChartProps = Pick<SavingsChartsProps, 'contribChartData' | 'baseCurrency' | 'fmtBase'>;

function ContribChart({ contribChartData, baseCurrency, fmtBase }: Readonly<ContribChartProps>) {
  return (
    <div className="bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm">
      <h3 className="font-semibold text-fg mb-1">Contributions vs Interest</h3>
      <p className="text-xs text-fg-faint mb-5">Monthly totals in {baseCurrency}</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={contribChartData} barSize={18}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--data-neutral)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--data-neutral)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`}
          />
          <Tooltip
            formatter={(value, name) => [
              fmtBase(Number(value) || 0),
              String(name) === 'contribution' ? 'Net Contributions' : 'Interest',
            ]}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid var(--border-default)',
              fontSize: '12px',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(value) => (value === 'contribution' ? 'Net Contributions' : 'Interest')}
          />
          <Bar dataKey="contribution" fill="var(--data-primary)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="interest" fill="var(--data-income)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SavingsCharts({
  growthChartData,
  contribChartData,
  baseCurrency,
  fmtBase,
}: Readonly<SavingsChartsProps>) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

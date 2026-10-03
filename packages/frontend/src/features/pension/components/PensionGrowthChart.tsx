import { ChartCard } from '@/components/ui';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PensionFormatBaseFn, PensionGrowthPoint } from '../types';
import { formatPercent } from '@quro/shared';

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
        <defs>
          <linearGradient id="pensionGrowthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--data-forecast)" stopOpacity={0.12} />
            <stop offset="95%" stopColor="var(--data-forecast)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12, fill: 'var(--data-neutral)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--data-neutral)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
        />
        <Tooltip
          formatter={(value) => [fmtBase(Number(value) || 0), 'Pension Value']}
          contentStyle={{
            borderRadius: '12px',
            border: '1px solid var(--border-default)',
            fontSize: '12px',
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--data-forecast)"
          strokeWidth={4}
          fill="url(#pensionGrowthGrad)"
          dot={false}
          activeDot={{ r: 5, fill: 'var(--data-forecast)' }}
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
      title="Total Pension Growth"
      subtitle={`Combined value across all pots (${baseCurrency})`}
      badge={
        pensionGrowthPct !== null && pensionGrowthData.length > 0 ? (
          <span
            className={`text-sm px-4 py-2 rounded-full font-semibold ${pensionGrowthPct >= 0 ? 'bg-warning-soft text-warning-fg' : 'bg-danger-soft text-danger-hover'}`}
          >
            {pensionGrowthPct >= 0 ? '+' : ''}
            {formatPercent(pensionGrowthPct, 0)} since {pensionGrowthData[0].year}
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

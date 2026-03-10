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
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
        />
        <Tooltip
          formatter={(value) => [fmtBase(Number(value) || 0), 'Pension Value']}
          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#f59e0b"
          strokeWidth={4}
          fill="url(#pensionGrowthGrad)"
          dot={false}
          activeDot={{ r: 5, fill: '#f59e0b' }}
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
            className={`text-sm px-4 py-2 rounded-full font-semibold ${pensionGrowthPct >= 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'}`}
          >
            {pensionGrowthPct >= 0 ? '+' : ''}
            {pensionGrowthPct.toFixed(0)}% since {pensionGrowthData[0].year}
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

import { ChartCard } from '@/components/ui';
import { ArrowUpRight } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import type { FmtFn, SalaryChartEntry } from '../types';

type SalaryHistoryChartProps = {
  data: readonly SalaryChartEntry[];
  growthPct: number;
  fmtBase: FmtFn;
  baseCurrency: string;
};

type ChartEntry = SalaryChartEntry & { deductions: number };

function SalaryTooltip({ active, payload, fmtBase }: TooltipContentProps & { fmtBase: FmtFn }) {
  if (!active || !payload?.length) return null;
  const chartEntry = payload[0]?.payload as Partial<ChartEntry> | undefined;
  const gross = typeof chartEntry?.gross === 'number' ? chartEntry.gross : 0;

  return (
    <div
      style={{
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        fontSize: '12px',
        background: '#fff',
        padding: '10px 14px',
      }}
    >
      {payload.map((entry, index) => (
        <div
          key={`${entry.dataKey ?? entry.name ?? index}`}
          style={{ color: entry.color, marginBottom: 4 }}
        >
          {entry.dataKey === 'net' ? 'Net Pay' : 'Deductions'}: {fmtBase(Number(entry.value) || 0)}
        </div>
      ))}
      <div
        style={{ color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 6, marginTop: 2 }}
      >
        Gross: {fmtBase(gross)}
      </div>
    </div>
  );
}

export function SalaryHistoryChart({
  data,
  growthPct,
  fmtBase,
  baseCurrency,
}: Readonly<SalaryHistoryChartProps>) {
  const chartData = data.map((entry) => ({ ...entry, deductions: entry.gross - entry.net }));

  return (
    <ChartCard
      title="Salary Growth History"
      subtitle={`Annual salary in ${baseCurrency}`}
      hasData={data.length > 0}
      emptyMessage="No salary history yet."
      footer={
        growthPct > 0 ? (
          <div className="mt-3 flex items-center gap-2 bg-emerald-50 rounded-xl p-3">
            <ArrowUpRight size={16} className="text-emerald-600" />
            <p className="text-xs text-emerald-700">
              Salary has grown by <strong>+{growthPct.toFixed(0)}%</strong> since {data[0].year}
            </p>
          </div>
        ) : undefined
      }
    >
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={(props) => <SalaryTooltip {...props} fmtBase={fmtBase} />} />
            <Legend
              formatter={(value) => (value === 'net' ? 'Net Pay' : 'Deductions')}
              wrapperStyle={{ fontSize: '11px' }}
            />
            <Bar dataKey="net" fill="#10b981" stackId="salary" name="net" />
            <Bar
              dataKey="deductions"
              fill="#f43f5e"
              stackId="salary"
              name="deductions"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

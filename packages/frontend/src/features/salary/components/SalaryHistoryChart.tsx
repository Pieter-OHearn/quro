import { ArrowUpRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { FmtFn, SalaryChartEntry } from '../types';

type SalaryHistoryChartProps = {
  data: readonly SalaryChartEntry[];
  growthPct: number;
  fmtBase: FmtFn;
  baseCurrency: string;
};

export function SalaryHistoryChart({
  data,
  growthPct,
  fmtBase,
  baseCurrency,
}: Readonly<SalaryHistoryChartProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Salary Growth History</h3>
      <p className="text-xs text-slate-400 mb-5">Annual gross in {baseCurrency}</p>
      {data.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} barSize={32}>
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
              <Tooltip
                formatter={(value: number) => [fmtBase(value), 'Annual Gross']}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="gross" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {growthPct > 0 && (
            <div className="mt-3 flex items-center gap-2 bg-emerald-50 rounded-xl p-3">
              <ArrowUpRight size={16} className="text-emerald-600" />
              <p className="text-xs text-emerald-700">
                Salary has grown by <strong>+{growthPct.toFixed(0)}%</strong> since {data[0].year}
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-slate-400 py-12 text-center">No salary history yet.</p>
      )}
    </div>
  );
}

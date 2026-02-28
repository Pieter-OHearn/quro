import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type PortfolioPoint = {
  month: string;
  brokerage: number;
  propertyEquity: number;
};

type PortfolioChartProps = {
  data: PortfolioPoint[];
  baseCurrency: string;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
};

type PortfolioAreaChartProps = {
  data: PortfolioPoint[];
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
};

function PortfolioAreaChart({ data, fmtBase }: PortfolioAreaChartProps) {
  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="investmentsBrokerageGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.16} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="investmentsPropertyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.16} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
          />
          <Tooltip
            formatter={(value, name) => [fmtBase(Number(value) || 0), name === 'brokerage' ? 'Brokerage' : 'Property Equity']}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
          />
          <Area type="monotone" dataKey="propertyEquity" stroke="#10b981" strokeWidth={3} fill="url(#investmentsPropertyGrad)" dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
          <Area type="monotone" dataKey="brokerage" stroke="#6366f1" strokeWidth={3} fill="url(#investmentsBrokerageGrad)" dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center gap-8 mt-4 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
          Brokerage
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          Property Equity
        </div>
      </div>
    </>
  );
}

export function PortfolioChart({ data, baseCurrency, fmtBase }: PortfolioChartProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="mb-5">
        <h3 className="font-semibold text-slate-900">Portfolio Performance</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Brokerage + Property equity in {baseCurrency}
        </p>
      </div>
      {data.length > 0 ? (
        <PortfolioAreaChart data={data} fmtBase={fmtBase} />
      ) : (
        <div className="flex items-center justify-center py-10 text-sm text-slate-400">
          Add transactions to generate portfolio history.
        </div>
      )}
    </div>
  );
}

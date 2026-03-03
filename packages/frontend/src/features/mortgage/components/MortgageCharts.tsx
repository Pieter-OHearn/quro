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
import type { AmortizationRow, MortgageFormatFn, PaymentBreakdownRow } from '../types';

const ROUNDED_BAR_RADIUS = 4;

type MortgageBalanceChartProps = {
  amortization: AmortizationRow[];
  fmt: MortgageFormatFn;
};

function MortgageBalanceChart({ amortization, fmt }: Readonly<MortgageBalanceChartProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Balance Projection</h3>
      <p className="text-xs text-slate-400 mb-5">Remaining balance over loan term</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={amortization}>
          <defs>
            <linearGradient id="mortGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
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
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(v: number) => [fmt(v), 'Balance']}
            contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#mortGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PaymentChartLegend() {
  return (
    <div className="flex items-center gap-5 mt-3">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-indigo-500" />
        <span className="text-xs text-slate-500">Principal</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-amber-400" />
        <span className="text-xs text-slate-500">Interest</span>
      </div>
    </div>
  );
}

type MortgagePaymentChartProps = {
  paymentBreakdown: PaymentBreakdownRow[];
  fmt: MortgageFormatFn;
};

function MortgagePaymentChart({ paymentBreakdown, fmt }: Readonly<MortgagePaymentChartProps>) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-1">Payment Breakdown</h3>
      <p className="text-xs text-slate-400 mb-5">Principal vs Interest per month</p>
      {paymentBreakdown.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={paymentBreakdown} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
                formatter={(v: number, name) => [
                  fmt(v),
                  name === 'principal' ? 'Principal' : 'Interest',
                ]}
              />
              <Bar
                dataKey="principal"
                name="principal"
                fill="#6366f1"
                stackId="a"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="interest"
                name="interest"
                fill="#f59e0b"
                stackId="a"
                radius={[ROUNDED_BAR_RADIUS, ROUNDED_BAR_RADIUS, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <PaymentChartLegend />
        </>
      ) : (
        <div className="flex items-center justify-center py-12 text-sm text-slate-400">
          No repayment transactions yet.
        </div>
      )}
    </div>
  );
}

type MortgageChartsProps = {
  fmt: MortgageFormatFn;
  amortization: AmortizationRow[];
  paymentBreakdown: PaymentBreakdownRow[];
};

export function MortgageCharts({
  fmt,
  amortization,
  paymentBreakdown,
}: Readonly<MortgageChartsProps>) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <MortgageBalanceChart amortization={amortization} fmt={fmt} />
      <MortgagePaymentChart paymentBreakdown={paymentBreakdown} fmt={fmt} />
    </div>
  );
}

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
import type { MortgageRepaymentType } from '@quro/shared';

const ROUNDED_BAR_RADIUS = 4;

type MortgageBalanceChartProps = {
  amortization: AmortizationRow[];
  fmt: MortgageFormatFn;
  repaymentType: MortgageRepaymentType;
};

function MortgageBalanceChart({
  amortization,
  fmt,
  repaymentType,
}: Readonly<MortgageBalanceChartProps>) {
  return (
    <div className="bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm">
      <h3 className="font-semibold text-fg mb-1">Balance Projection</h3>
      <p className="text-xs text-fg-faint mb-5">
        Remaining balance using the {repaymentType.toLowerCase()} repayment method
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={amortization}>
          <defs>
            <linearGradient id="mortGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--data-primary)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--data-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: 'var(--data-neutral)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--data-neutral)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value) => [fmt(Number(value) || 0), 'Balance']}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid var(--border-default)',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--data-primary)"
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
        <div className="w-3 h-3 rounded-sm bg-brand-accent" />
        <span className="text-xs text-fg-subtle">Principal</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-warning-muted" />
        <span className="text-xs text-fg-subtle">Interest</span>
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
    <div className="bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm">
      <h3 className="font-semibold text-fg mb-1">Payment Breakdown</h3>
      <p className="text-xs text-fg-faint mb-5">Principal vs Interest per month</p>
      {paymentBreakdown.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={paymentBreakdown} barSize={22}>
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
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid var(--border-default)',
                  fontSize: '12px',
                }}
                formatter={(value, name) => [
                  fmt(Number(value) || 0),
                  String(name) === 'principal' ? 'Principal' : 'Interest',
                ]}
              />
              <Bar
                dataKey="principal"
                name="principal"
                fill="var(--data-primary)"
                stackId="a"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="interest"
                name="interest"
                fill="var(--data-forecast)"
                stackId="a"
                radius={[ROUNDED_BAR_RADIUS, ROUNDED_BAR_RADIUS, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <PaymentChartLegend />
        </>
      ) : (
        <div className="flex items-center justify-center py-12 text-sm text-fg-faint">
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
  repaymentType: MortgageRepaymentType;
};

export function MortgageCharts({
  fmt,
  amortization,
  paymentBreakdown,
  repaymentType,
}: Readonly<MortgageChartsProps>) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <MortgageBalanceChart amortization={amortization} fmt={fmt} repaymentType={repaymentType} />
      <MortgagePaymentChart paymentBreakdown={paymentBreakdown} fmt={fmt} />
    </div>
  );
}

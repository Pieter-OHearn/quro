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
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_PROPS } from '@/lib/chartStyles';
import type { AmortizationRow, MortgageFormatFn, PaymentBreakdownRow } from '../types';
import type { MortgageRepaymentType } from '@quro/shared';

// The balance and the principal that pays it down are debt (`viz-6`); interest is a cost.
const DEBT_COLOR = 'var(--viz-6)';
const INTEREST_COLOR = 'var(--viz-3)';
const CHART_HEIGHT = 200;

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
    <ChartCard
      title="Balance projection"
      subtitle={`Remaining balance using the ${repaymentType.toLowerCase()} repayment method`}
      hasData
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={amortization}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="year" {...CHART_AXIS_PROPS} />
          <YAxis {...CHART_AXIS_PROPS} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            cursor={{ stroke: 'var(--border-default)' }}
            formatter={(value) => [fmt(Number(value) || 0), 'Balance']}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={DEBT_COLOR}
            strokeWidth={2}
            fill={DEBT_COLOR}
            fillOpacity={0.12}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function PaymentChartLegend() {
  return (
    <div className="mt-3 flex items-center gap-4">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DEBT_COLOR }} />
        <span className="text-caption text-fg-muted">Principal</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: INTEREST_COLOR }} />
        <span className="text-caption text-fg-muted">Interest</span>
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
    <ChartCard
      title="Payment breakdown"
      subtitle="Principal and interest per month"
      hasData={paymentBreakdown.length > 0}
      emptyMessage="No repayment transactions yet."
      footer={<PaymentChartLegend />}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={paymentBreakdown} barSize={22}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" {...CHART_AXIS_PROPS} />
          <YAxis {...CHART_AXIS_PROPS} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            formatter={(value, name) => [
              fmt(Number(value) || 0),
              String(name) === 'principal' ? 'Principal' : 'Interest',
            ]}
          />
          <Bar dataKey="principal" name="principal" fill={DEBT_COLOR} stackId="a" />
          <Bar dataKey="interest" name="interest" fill={INTEREST_COLOR} stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <MortgageBalanceChart amortization={amortization} fmt={fmt} repaymentType={repaymentType} />
      <MortgagePaymentChart paymentBreakdown={paymentBreakdown} fmt={fmt} />
    </div>
  );
}

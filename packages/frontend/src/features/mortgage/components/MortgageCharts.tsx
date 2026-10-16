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
import { ChartCard, buildChartAlternative } from '@/components/ui';
import { ChartLegend } from '@/components/finance/chartTheme';
import {
  CHART_GRID_PROPS,
  CHART_TOOLTIP_PROPS,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
  formatAxisCompact,
} from '@/lib/chartStyles';
import { useChartMotion } from '@/hooks/useMediaQuery';
import type { AmortizationRow, MortgageFormatFn, PaymentBreakdownRow } from '../types';
import type { MortgageRepaymentType } from '@quro/shared';

// The balance and the principal that pays it down are debt (`viz-6`); interest is a cost.
const DEBT_COLOR = 'var(--viz-6)';
const INTEREST_COLOR = 'var(--viz-3)';
const CHART_HEIGHT = 200;
// Interest is a tinted, outlined bar beside the solid principal, so it is not told apart by hue alone.
const SOFT_FILL_OPACITY = 0.3;

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
  const motion = useChartMotion();
  return (
    <ChartCard
      title="Balance projection"
      subtitle={`Remaining balance using the ${repaymentType.toLowerCase()} repayment method`}
      hasData={amortization.length > 0}
      emptyMessage="No balance projection yet."
      alternative={buildChartAlternative({
        subject: 'Balance projection',
        xLabel: 'Year',
        x: (row) => row.year,
        rows: amortization,
        columns: [{ label: 'Remaining balance', value: (row) => row.balance, format: fmt }],
        note: 'A projection from the current terms, not a record of payments made.',
      })}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart data={amortization} accessibilityLayer>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="year" {...CHART_X_AXIS_PROPS} />
          <YAxis {...CHART_Y_AXIS_PROPS} tickFormatter={(v) => formatAxisCompact(v)} />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            {...motion}
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
            {...motion}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function PaymentChartLegend() {
  return (
    <ChartLegend
      items={[
        { label: 'Principal', color: DEBT_COLOR, swatch: 'solid' },
        { label: 'Interest', color: INTEREST_COLOR, swatch: 'soft' },
      ]}
    />
  );
}

type MortgagePaymentChartProps = {
  paymentBreakdown: PaymentBreakdownRow[];
  fmt: MortgageFormatFn;
};

function MortgagePaymentChart({ paymentBreakdown, fmt }: Readonly<MortgagePaymentChartProps>) {
  const motion = useChartMotion();
  return (
    <ChartCard
      title="Payment breakdown"
      subtitle="Principal and interest per month"
      hasData={paymentBreakdown.length > 0}
      emptyMessage="No repayment transactions yet."
      footer={<PaymentChartLegend />}
      alternative={buildChartAlternative({
        subject: 'Payment breakdown',
        xLabel: 'Month',
        x: (row) => row.month,
        rows: paymentBreakdown,
        columns: [
          { label: 'Principal', value: (row) => row.principal, format: fmt },
          { label: 'Interest', value: (row) => row.interest, format: fmt },
        ],
      })}
    >
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={paymentBreakdown} barSize={22} accessibilityLayer>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" {...CHART_X_AXIS_PROPS} />
          <YAxis {...CHART_Y_AXIS_PROPS} tickFormatter={(v) => formatAxisCompact(v)} />
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            {...motion}
            formatter={(value, name) => [
              fmt(Number(value) || 0),
              String(name) === 'principal' ? 'Principal' : 'Interest',
            ]}
          />
          <Bar dataKey="principal" name="principal" fill={DEBT_COLOR} stackId="a" {...motion} />
          <Bar
            dataKey="interest"
            name="interest"
            fill={INTEREST_COLOR}
            fillOpacity={SOFT_FILL_OPACITY}
            stroke={INTEREST_COLOR}
            stackId="a"
            {...motion}
          />
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

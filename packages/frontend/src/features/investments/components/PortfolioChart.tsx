import { ChartCard } from '@/components/ui';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { PortfolioHistoryPoint } from '../types';

type PortfolioChartProps = {
  data: PortfolioHistoryPoint[];
  baseCurrency: string;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
};

type PortfolioAreaChartProps = {
  data: PortfolioHistoryPoint[];
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
};

function PortfolioChartDefs() {
  return (
    <defs>
      <linearGradient id="investmentsBrokerageGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="var(--data-primary)" stopOpacity={0.16} />
        <stop offset="95%" stopColor="var(--data-primary)" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="investmentsPropertyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="var(--data-income)" stopOpacity={0.16} />
        <stop offset="95%" stopColor="var(--data-income)" stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

function PortfolioChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-8 mt-4 text-sm text-fg-muted">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-brand-accent" />
        Brokerage
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-success-accent" />
        Your Property Equity
      </div>
      <div className="text-xs text-fg-subtle">
        Estimated where historical market prices are unavailable.
      </div>
    </div>
  );
}

function PortfolioAreaChart({ data, fmtBase }: PortfolioAreaChartProps) {
  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <PortfolioChartDefs />
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
          <XAxis
            dataKey="month"
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
            formatter={(value, name, item) => {
              const isEstimated =
                name === 'brokerage' &&
                Boolean(
                  item &&
                  typeof item === 'object' &&
                  'payload' in item &&
                  (item as { payload?: { isEstimated?: boolean } }).payload?.isEstimated,
                );
              return [
                fmtBase(Number(value) || 0),
                name === 'brokerage'
                  ? `Brokerage${isEstimated ? ' (estimated)' : ''}`
                  : 'Your Property Equity',
              ];
            }}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid var(--border-default)',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="propertyEquity"
            stroke="var(--data-income)"
            strokeWidth={3}
            fill="url(#investmentsPropertyGrad)"
            dot={false}
            activeDot={{ r: 4, fill: 'var(--data-income)' }}
          />
          <Area
            type="monotone"
            dataKey="brokerage"
            stroke="var(--data-primary)"
            strokeWidth={3}
            fill="url(#investmentsBrokerageGrad)"
            dot={false}
            activeDot={{ r: 4, fill: 'var(--data-primary)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <PortfolioChartLegend />
    </>
  );
}

export function PortfolioChart({ data, baseCurrency, fmtBase }: PortfolioChartProps) {
  return (
    <ChartCard
      title="Portfolio Performance"
      subtitle={`Brokerage + your property equity in ${baseCurrency}`}
      hasData={data.length > 0}
      emptyMessage="Add transactions to generate portfolio history."
    >
      {data.length > 0 && <PortfolioAreaChart data={data} fmtBase={fmtBase} />}
    </ChartCard>
  );
}

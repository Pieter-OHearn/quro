import { ChartCard } from '@/components/ui';
import { useCurrency } from '@/lib/CurrencyContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_AXIS_PROPS, CHART_GRID_PROPS } from '@/lib/chartStyles';
import type { TooltipContentProps } from 'recharts';
import type { FmtFn, SalaryChartEntry } from '../types';
import { formatPercent } from '@quro/shared';

type SalaryHistoryChartProps = {
  data: readonly SalaryChartEntry[];
  growthPct: number;
  fmtBase: FmtFn;
  baseCurrency: string;
};

type ChartEntry = SalaryChartEntry & { deductions: number };

const NET_COLOR = 'var(--viz-1)';
const DEDUCTIONS_COLOR = 'var(--viz-6)';

// The shared chart tooltip: inverse surface, 12px tabular text, popover shadow.
function SalaryTooltip({ active, payload, fmtBase }: TooltipContentProps & { fmtBase: FmtFn }) {
  if (!active || !payload?.length) return null;
  const chartEntry = payload[0]?.payload as Partial<ChartEntry> | undefined;
  const gross = typeof chartEntry?.gross === 'number' ? chartEntry.gross : 0;

  return (
    <div className="rounded-md bg-surface-inverse px-2 py-1 text-caption text-fg-on-inverse shadow-popover font-numeric">
      {payload.map((entry, index) => (
        <p key={`${entry.dataKey ?? entry.name ?? index}`}>
          {entry.dataKey === 'net' ? 'Net pay' : 'Deductions'}: {fmtBase(Number(entry.value) || 0)}
        </p>
      ))}
      <p className="mt-0.5 border-t border-fg-on-inverse/20 pt-0.5">Gross: {fmtBase(gross)}</p>
    </div>
  );
}

function SalaryChartLegend() {
  return (
    <div className="mt-2 flex items-center gap-4">
      {[
        { label: 'Net pay', color: NET_COLOR },
        { label: 'Deductions', color: DEDUCTIONS_COLOR },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-caption text-fg-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function SalaryHistoryChart({
  data,
  growthPct,
  fmtBase,
  baseCurrency,
}: Readonly<SalaryHistoryChartProps>) {
  const { numberFormat } = useCurrency();
  const chartData = data.map((entry) => ({ ...entry, deductions: entry.gross - entry.net }));

  return (
    <ChartCard
      title="Salary growth history"
      subtitle={`Annual salary in ${baseCurrency}`}
      hasData={data.length > 0}
      emptyMessage="No salary history yet."
      footer={
        <>
          <SalaryChartLegend />
          {growthPct > 0 ? (
            <p className="mt-2 border-t border-border-subtle pt-2 text-caption text-fg-muted">
              Salary has grown by{' '}
              <span className="font-medium font-numeric text-gain">
                +{formatPercent(growthPct, numberFormat, 0)}
              </span>{' '}
              since {data[0].year}
            </p>
          ) : null}
        </>
      }
    >
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barSize={32}>
            <CartesianGrid {...CHART_GRID_PROPS} />
            <XAxis dataKey="year" {...CHART_AXIS_PROPS} />
            <YAxis
              {...CHART_AXIS_PROPS}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              content={(props) => <SalaryTooltip {...props} fmtBase={fmtBase} />}
            />
            <Bar dataKey="net" fill={NET_COLOR} stackId="salary" name="net" />
            <Bar dataKey="deductions" fill={DEDUCTIONS_COLOR} stackId="salary" name="deductions" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

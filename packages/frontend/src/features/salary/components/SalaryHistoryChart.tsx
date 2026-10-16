import { ChartCard, buildChartAlternative } from '@/components/ui';
import { ChartLegend } from '@/components/finance/chartTheme';
import { useChartMotion } from '@/hooks/useMediaQuery';
import { useCurrency } from '@/lib/CurrencyContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  CHART_GRID_PROPS,
  CHART_TOOLTIP_CLASS,
  CHART_TOOLTIP_WRAPPER_STYLE,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
  formatAxisCompact,
} from '@/lib/chartStyles';
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
    <div className={`${CHART_TOOLTIP_CLASS} font-numeric`}>
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
    <ChartLegend
      items={[
        { label: 'Net pay', color: NET_COLOR, swatch: 'solid' },
        { label: 'Deductions', color: DEDUCTIONS_COLOR, swatch: 'soft' },
      ]}
    />
  );
}

export function SalaryHistoryChart({
  data,
  growthPct,
  fmtBase,
  baseCurrency,
}: Readonly<SalaryHistoryChartProps>) {
  const { numberFormat } = useCurrency();
  const motion = useChartMotion();
  const chartData = data.map((entry) => ({ ...entry, deductions: entry.gross - entry.net }));

  return (
    <ChartCard
      title="Salary growth history"
      subtitle={`Annual salary in ${baseCurrency}`}
      hasData={data.length > 0}
      emptyMessage="No salary history yet."
      alternative={buildChartAlternative({
        subject: 'Salary growth history',
        xLabel: 'Year',
        x: (entry) => entry.year,
        rows: chartData,
        columns: [
          { label: 'Net pay', value: (entry) => entry.net, format: fmtBase },
          { label: 'Deductions', value: (entry) => entry.deductions, format: fmtBase },
          { label: 'Gross', value: (entry) => entry.gross, format: fmtBase },
        ],
      })}
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
          <BarChart data={chartData} barSize={32} accessibilityLayer>
            <CartesianGrid {...CHART_GRID_PROPS} />
            <XAxis dataKey="year" {...CHART_X_AXIS_PROPS} />
            <YAxis {...CHART_Y_AXIS_PROPS} tickFormatter={(value) => formatAxisCompact(value)} />
            <Tooltip
              {...motion}
              wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
              cursor={{ fill: 'var(--surface-muted)' }}
              content={(props) => <SalaryTooltip {...props} fmtBase={fmtBase} />}
            />
            <Bar dataKey="net" fill={NET_COLOR} stackId="salary" name="net" {...motion} />
            <Bar
              dataKey="deductions"
              fill={DEDUCTIONS_COLOR}
              fillOpacity={0.3}
              stroke={DEDUCTIONS_COLOR}
              stackId="salary"
              name="deductions"
              {...motion}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

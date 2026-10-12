import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DataKey } from 'recharts/types/util/types';
import { cn } from '@/lib/utils';
import { ChartCard } from '../ChartCard';

// One series: a 2px `brand` line over a flat `brand-soft` fill, horizontal gridlines only and
// 11px tabular axis labels. `color` no longer changes the series colour; it stays for callers.
const SERIES_STROKE = 'var(--brand)';
const SERIES_FILL = 'var(--brand-soft)';
const AXIS_TICK = { fontSize: 11, fill: 'var(--chart-axis)', className: 'font-numeric' };
const ACTIVE_DOT = { r: 4, fill: SERIES_STROKE, stroke: 'var(--surface)', strokeWidth: 2 };

export type AreaChartCardProps<T extends Record<string, unknown>> = {
  title: string;
  subtitle: string;
  data: readonly T[];
  dataKey: DataKey<T, number>;
  xKey: DataKey<T, string | number>;
  color: string;
  height?: number;
  formatValue: (v: number) => string;
  formatYAxis?: (v: number) => string;
  badge?: React.ReactNode;
  emptyMessage?: string;
  strokeWidth?: number;
  className?: string;
  estimatedKey?: keyof T;
};

type ChartContentProps<T extends Record<string, unknown>> = {
  data: readonly T[];
  dataKey: DataKey<T, number>;
  xKey: DataKey<T, string | number>;
  height: number;
  formatValue: (v: number) => string;
  formatYAxis?: (v: number) => string;
  strokeWidth: number;
  title: string;
  estimatedKey?: keyof T;
};

type SegmentedChartPoint<T> = T & {
  __actualValue?: number;
  __estimatedValue?: number;
};

function readDataValue<T extends Record<string, unknown>>(row: T, key: DataKey<T, number>): number {
  if (typeof key === 'function') return Number(key(row));
  return Number(row[String(key)]);
}

function segmentEstimatedData<T extends Record<string, unknown>>(
  data: readonly T[],
  dataKey: DataKey<T, number>,
  estimatedKey: keyof T,
): SegmentedChartPoint<T>[] {
  const points = data.map((row) => {
    const value = readDataValue(row, dataKey);
    return {
      ...row,
      __actualValue: row[estimatedKey] ? undefined : value,
      __estimatedValue: row[estimatedKey] ? value : undefined,
    };
  });
  for (let index = 1; index < points.length; index += 1) {
    const previousEstimated = Boolean(data[index - 1][estimatedKey]);
    const currentEstimated = Boolean(data[index][estimatedKey]);
    if (previousEstimated === currentEstimated) continue;
    if (currentEstimated) {
      points[index - 1].__estimatedValue = readDataValue(data[index - 1], dataKey);
    } else {
      points[index].__estimatedValue = readDataValue(data[index], dataKey);
    }
  }
  return points;
}

function ChartSeries<T extends Record<string, unknown>>({
  estimatedKey,
  dataKey,
  strokeWidth,
}: Pick<ChartContentProps<T>, 'estimatedKey' | 'dataKey' | 'strokeWidth'>) {
  if (!estimatedKey) {
    return (
      <Area
        type="monotone"
        dataKey={dataKey}
        stroke={SERIES_STROKE}
        strokeWidth={strokeWidth}
        fill={SERIES_FILL}
        fillOpacity={1}
        dot={false}
        activeDot={ACTIVE_DOT}
      />
    );
  }
  return (
    <>
      <Area
        type="monotone"
        dataKey="__actualValue"
        stroke={SERIES_STROKE}
        strokeWidth={strokeWidth}
        fill={SERIES_FILL}
        fillOpacity={1}
        dot={false}
        activeDot={ACTIVE_DOT}
      />
      <Area
        type="monotone"
        dataKey="__estimatedValue"
        stroke={SERIES_STROKE}
        strokeWidth={strokeWidth}
        strokeDasharray="6 5"
        fill="transparent"
        dot={false}
        activeDot={ACTIVE_DOT}
      />
    </>
  );
}

type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: readonly { name?: string | number; value?: unknown }[];
  title: string;
  formatValue: (v: number) => string;
};

/** The shared chart tooltip: inverse surface, 12px text, popover shadow. */
function ChartTooltip({ active, label, payload, title, formatValue }: Readonly<ChartTooltipProps>) {
  const entries = (payload ?? []).filter((entry) => entry.value != null);
  if (!active || entries.length === 0) return null;
  return (
    <div className="rounded-md bg-surface-inverse px-2 py-1 text-caption text-fg-on-inverse shadow-popover">
      <p className="font-medium">{label}</p>
      {entries.map((entry) => (
        <p key={String(entry.name)} className="font-numeric">
          {entry.name === '__estimatedValue' ? `${title} (estimated)` : title}:{' '}
          {formatValue(Number(entry.value) || 0)}
        </p>
      ))}
    </div>
  );
}

function ChartContent<T extends Record<string, unknown>>({
  data,
  dataKey,
  xKey,
  height,
  formatValue,
  formatYAxis,
  strokeWidth,
  title,
  estimatedKey,
}: ChartContentProps<T>) {
  const yTickFormatter = (value: unknown) =>
    formatYAxis ? formatYAxis(Number(value)) : `${(Number(value) / 1000).toFixed(0)}k`;
  const chartData = estimatedKey ? segmentEstimatedData(data, dataKey, estimatedKey) : [...data];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={yTickFormatter} />
        <Tooltip
          cursor={{ stroke: 'var(--border-default)' }}
          content={(props) => (
            <ChartTooltip
              active={props.active}
              label={props.label as string | number | undefined}
              payload={props.payload}
              title={title}
              formatValue={formatValue}
            />
          )}
        />
        <ChartSeries estimatedKey={estimatedKey} dataKey={dataKey} strokeWidth={strokeWidth} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AreaChartCard<T extends Record<string, unknown>>({
  title,
  subtitle,
  data,
  dataKey,
  xKey,
  height = 220,
  formatValue,
  formatYAxis,
  badge,
  emptyMessage = 'No data yet.',
  strokeWidth = 2,
  className,
  estimatedKey,
}: AreaChartCardProps<T>) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      badge={badge}
      hasData={data.length > 0}
      emptyMessage={emptyMessage}
      className={cn(className)}
    >
      {data.length > 0 && (
        <ChartContent
          data={data}
          dataKey={dataKey}
          xKey={xKey}
          height={height}
          formatValue={formatValue}
          formatYAxis={formatYAxis}
          strokeWidth={strokeWidth}
          title={title}
          estimatedKey={estimatedKey}
        />
      )}
      {estimatedKey && data.some((point) => Boolean(point[estimatedKey])) ? (
        <p className="mt-2 text-caption text-fg-subtle">
          Dashed segments use fallback FX or price data and are estimated.
        </p>
      ) : null}
    </ChartCard>
  );
}

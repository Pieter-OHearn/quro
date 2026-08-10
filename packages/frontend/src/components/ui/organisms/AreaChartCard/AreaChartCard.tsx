import { useId } from 'react';
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
  color: string;
  height: number;
  formatValue: (v: number) => string;
  formatYAxis?: (v: number) => string;
  strokeWidth: number;
  gradientId: string;
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

function ChartGradient({ id, color }: Readonly<{ id: string; color: string }>) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.15} />
        <stop offset="95%" stopColor={color} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

function ChartSeries<T extends Record<string, unknown>>({
  estimatedKey,
  dataKey,
  color,
  strokeWidth,
  gradientId,
}: Pick<
  ChartContentProps<T>,
  'estimatedKey' | 'dataKey' | 'color' | 'strokeWidth' | 'gradientId'
>) {
  if (!estimatedKey) {
    return (
      <Area
        type="monotone"
        dataKey={dataKey}
        stroke={color}
        strokeWidth={strokeWidth}
        fill={`url(#${gradientId})`}
        dot={false}
        activeDot={{ r: 5, fill: color }}
      />
    );
  }
  return (
    <>
      <Area
        type="monotone"
        dataKey="__actualValue"
        stroke={color}
        strokeWidth={strokeWidth}
        fill={`url(#${gradientId})`}
        dot={false}
        activeDot={{ r: 5, fill: color }}
      />
      <Area
        type="monotone"
        dataKey="__estimatedValue"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray="6 5"
        fill="transparent"
        dot={false}
        activeDot={{ r: 5, fill: color }}
      />
    </>
  );
}

function ChartContent<T extends Record<string, unknown>>({
  data,
  dataKey,
  xKey,
  color,
  height,
  formatValue,
  formatYAxis,
  strokeWidth,
  gradientId,
  title,
  estimatedKey,
}: ChartContentProps<T>) {
  const yTickFormatter = (value: unknown) =>
    formatYAxis ? formatYAxis(Number(value)) : `${(Number(value) / 1000).toFixed(0)}k`;
  const chartData = estimatedKey ? segmentEstimatedData(data, dataKey, estimatedKey) : [...data];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData}>
        <ChartGradient id={gradientId} color={color} />
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: 'var(--fg-faint)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--fg-faint)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          formatter={(value, name) => [
            formatValue(Number(value) || 0),
            name === '__estimatedValue' ? `${title} (estimated)` : title,
          ]}
          contentStyle={{
            borderRadius: '12px',
            border: '1px solid var(--border-default)',
            fontSize: '12px',
          }}
        />
        <ChartSeries
          estimatedKey={estimatedKey}
          dataKey={dataKey}
          color={color}
          strokeWidth={strokeWidth}
          gradientId={gradientId}
        />
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
  color,
  height = 220,
  formatValue,
  formatYAxis,
  badge,
  emptyMessage = 'No data yet.',
  strokeWidth = 2.5,
  className,
  estimatedKey,
}: AreaChartCardProps<T>) {
  const gradientId = useId().replace(/:/g, '');

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      badge={badge}
      hasData={data.length > 0}
      emptyMessage={emptyMessage}
      className={cn(className)}
      headerClassName="mb-6"
    >
      {data.length > 0 && (
        <ChartContent
          data={data}
          dataKey={dataKey}
          xKey={xKey}
          color={color}
          height={height}
          formatValue={formatValue}
          formatYAxis={formatYAxis}
          strokeWidth={strokeWidth}
          gradientId={gradientId}
          title={title}
          estimatedKey={estimatedKey}
        />
      )}
      {estimatedKey && data.some((point) => Boolean(point[estimatedKey])) ? (
        <p className="mt-3 text-xs text-fg-faint">
          Dashed segments use fallback FX or price data and are estimated.
        </p>
      ) : null}
    </ChartCard>
  );
}

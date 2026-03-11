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
import { cn } from '@/lib/utils';
import { ChartCard } from '../ChartCard';

export type AreaChartCardProps<T extends Record<string, unknown>> = {
  title: string;
  subtitle: string;
  data: readonly T[];
  dataKey: keyof T & string;
  xKey: keyof T & string;
  color: string;
  height?: number;
  formatValue: (v: number) => string;
  formatYAxis?: (v: number) => string;
  badge?: React.ReactNode;
  emptyMessage?: string;
  strokeWidth?: number;
  className?: string;
};

type ChartContentProps<T extends Record<string, unknown>> = {
  data: readonly T[];
  dataKey: keyof T & string;
  xKey: keyof T & string;
  color: string;
  height: number;
  formatValue: (v: number) => string;
  formatYAxis?: (v: number) => string;
  strokeWidth: number;
  gradientId: string;
  title: string;
};

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
}: ChartContentProps<T>) {
  const yTickFormatter = (value: unknown) =>
    formatYAxis ? formatYAxis(Number(value)) : `${(Number(value) / 1000).toFixed(0)}k`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={[...data]}>
        <ChartGradient id={gradientId} color={color} />
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          formatter={(value) => [formatValue(Number(value) || 0), title]}
          contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 5, fill: color }}
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
        />
      )}
    </ChartCard>
  );
}

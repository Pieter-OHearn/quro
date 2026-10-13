import type { ReactNode } from 'react';

/** Axis labels: 11px tabular figures in the chart axis colour, without axis or tick lines. */
export const CHART_AXIS_PROPS = {
  tick: { fontSize: 11, fill: 'var(--chart-axis)', className: 'font-numeric' },
  axisLine: false,
  tickLine: false,
} as const;

/** Horizontal gridlines only. */
export const CHART_GRID_PROPS = { vertical: false, stroke: 'var(--chart-grid)' } as const;

export const CHART_CURSOR = { stroke: 'var(--border-default)' } as const;
export const CHART_BAR_CURSOR = { fill: 'var(--surface-muted)' } as const;

export type ChartTooltipEntry = {
  name?: string | number;
  dataKey?: unknown;
  value?: unknown;
  color?: string;
  payload?: unknown;
};

type ChartTooltipContentProps = {
  active?: boolean;
  label?: ReactNode;
  payload?: readonly ChartTooltipEntry[];
  /** Returns the row text for one series, or null to leave the series out. */
  formatEntry: (entry: ChartTooltipEntry) => { name: string; value: string } | null;
};

/** The chart tooltip: inverse surface, 12px text, popover shadow, like the shared chart cards. */
export function ChartTooltipContent({
  active,
  label,
  payload,
  formatEntry,
}: Readonly<ChartTooltipContentProps>) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((entry) => entry.value != null)
    .map((entry) => ({ entry, row: formatEntry(entry) }))
    .filter(
      (item): item is { entry: ChartTooltipEntry; row: { name: string; value: string } } =>
        item.row !== null,
    );
  if (rows.length === 0) return null;
  return (
    <div className="rounded-md bg-surface-inverse px-2 py-1 text-caption text-fg-on-inverse shadow-popover">
      {label != null && label !== '' ? <p className="font-medium">{label}</p> : null}
      {rows.map(({ entry, row }) => (
        <p key={String(entry.dataKey ?? entry.name)} className="font-numeric">
          {row.name}: {row.value}
        </p>
      ))}
    </div>
  );
}

type ChartLegendItem = { label: string; color: string; dashed?: boolean; opacity?: number };

/** A legend below a chart: a short line or dot per series, then the label in the caption style. */
export function ChartLegend({
  items,
  note,
}: Readonly<{ items: readonly ChartLegendItem[]; note?: ReactNode }>) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-3 border-t-2"
            style={{
              borderColor: item.color,
              borderTopStyle: item.dashed ? 'dashed' : 'solid',
              opacity: item.opacity,
            }}
          />
          {item.label}
        </span>
      ))}
      {note ? <span className="text-fg-subtle">{note}</span> : null}
    </div>
  );
}

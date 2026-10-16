import type { ReactNode } from 'react';
import { CHART_TOOLTIP_CLASS } from '@/lib/chartStyles';

// Axis labels (11px tabular figures, no axis or tick lines) and horizontal-only gridlines are
// shared with the chart cards in `lib/chartStyles.ts`.
export {
  CHART_AXIS_PROPS,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_WRAPPER_STYLE,
  CHART_X_AXIS_PROPS,
  CHART_Y_AXIS_PROPS,
} from '@/lib/chartStyles';

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
    <div className={CHART_TOOLTIP_CLASS}>
      {label != null && label !== '' ? <p className="font-medium">{label}</p> : null}
      {rows.map(({ entry, row }) => (
        <p key={String(entry.dataKey ?? entry.name)} className="font-numeric">
          {row.name}: {row.value}
        </p>
      ))}
    </div>
  );
}

type ChartLegendItem = {
  label: string;
  color: string;
  dashed?: boolean;
  opacity?: number;
  /** A square key for bars: `solid`, `soft` (a tinted fill with an outline) or `line`. */
  swatch?: 'line' | 'solid' | 'soft';
};

function LegendKey({ item }: Readonly<{ item: ChartLegendItem }>) {
  if (item.swatch === 'solid' || item.swatch === 'soft') {
    // A bar key. The soft fill keeps its outline, so it differs from the solid one by more than
    // hue.
    return (
      <span
        aria-hidden
        className="inline-block size-2.5 shrink-0 rounded-sm border"
        style={{
          borderColor: item.color,
          backgroundColor:
            item.swatch === 'solid'
              ? item.color
              : `color-mix(in srgb, ${item.color} 30%, transparent)`,
          opacity: item.opacity,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block h-0 w-3 shrink-0 border-t-2"
      style={{
        borderColor: item.color,
        borderTopStyle: item.dashed ? 'dashed' : 'solid',
        opacity: item.opacity,
      }}
    />
  );
}

/** A legend below a chart: a short line or dot per series, then the label in the caption style. */
export function ChartLegend({
  items,
  note,
}: Readonly<{ items: readonly ChartLegendItem[]; note?: ReactNode }>) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <LegendKey item={item} />
          {item.label}
        </span>
      ))}
      {note ? <span className="text-fg-subtle">{note}</span> : null}
    </div>
  );
}

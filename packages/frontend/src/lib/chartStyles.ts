import type { CSSProperties } from 'react';

/**
 * Recharts props for the V1 chart rules: horizontal gridlines only, 11px tabular axis labels and
 * the inverse tooltip used by the shared chart cards. Series colours come from `--viz-*`.
 */
export const CHART_GRID_PROPS = { vertical: false, stroke: 'var(--chart-grid)' } as const;

export const CHART_AXIS_TICK = {
  fontSize: 11,
  fill: 'var(--chart-axis)',
  className: 'font-numeric',
} as const;

export const CHART_AXIS_PROPS = {
  tick: CHART_AXIS_TICK,
  axisLine: false,
  tickLine: false,
} as const;

/**
 * Category axes keep the first and last label and drop the ones that would touch, so a phone
 * shows fewer, legible labels instead of a crowd. The exact values stay in the data table.
 */
export const CHART_X_AXIS_PROPS = {
  ...CHART_AXIS_PROPS,
  interval: 'preserveStartEnd',
  minTickGap: 16,
} as const;

/** Value axes size themselves to their labels, so nothing clips and no gutter is wasted. */
export const CHART_Y_AXIS_PROPS = { ...CHART_AXIS_PROPS, width: 'auto' } as const;

const COMPACT_NUMBER = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** A short axis label such as 1.5K, 250 or -2M. Axis labels are not exact values. */
export function formatAxisCompact(value: number): string {
  if (!Number.isFinite(value)) return '';
  return COMPACT_NUMBER.format(value).replace('-', '\u2212');
}

/**
 * The tooltip box: never wider than the viewport minus the card gutters, long labels wrap, and
 * it ignores the pointer so it can not trap a touch that should scroll the page.
 */
export const CHART_TOOLTIP_CLASS =
  'max-w-[min(18rem,calc(100vw-3rem))] break-words rounded-md bg-surface-inverse px-2 py-1 text-caption text-fg-on-inverse shadow-popover';

export const CHART_TOOLTIP_WRAPPER_STYLE: CSSProperties = { pointerEvents: 'none', zIndex: 10 };

const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: 'var(--surface-inverse)',
  border: 'none',
  borderRadius: 6,
  boxShadow: 'var(--shadow-popover)',
  color: 'var(--fg-on-inverse)',
  fontSize: 12,
  lineHeight: '16px',
  padding: '4px 8px',
  maxWidth: 'min(18rem, calc(100vw - 3rem))',
  overflowWrap: 'anywhere',
  whiteSpace: 'normal',
};

const TOOLTIP_TEXT_STYLE: CSSProperties = {
  color: 'var(--fg-on-inverse)',
  fontVariantNumeric: 'tabular-nums',
  padding: 0,
};

export const CHART_TOOLTIP_PROPS = {
  contentStyle: TOOLTIP_CONTENT_STYLE,
  itemStyle: TOOLTIP_TEXT_STYLE,
  labelStyle: { ...TOOLTIP_TEXT_STYLE, fontWeight: 500 },
  cursor: { fill: 'var(--surface-muted)', stroke: 'var(--border-default)' },
  wrapperStyle: CHART_TOOLTIP_WRAPPER_STYLE,
} as const;

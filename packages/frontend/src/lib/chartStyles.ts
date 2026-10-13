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

const TOOLTIP_CONTENT_STYLE: CSSProperties = {
  background: 'var(--surface-inverse)',
  border: 'none',
  borderRadius: 6,
  boxShadow: 'var(--shadow-popover)',
  color: 'var(--fg-on-inverse)',
  fontSize: 12,
  lineHeight: '16px',
  padding: '4px 8px',
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
} as const;

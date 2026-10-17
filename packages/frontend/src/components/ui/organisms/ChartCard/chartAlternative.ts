/**
 * The text alternative of a chart: a one-paragraph summary read with the chart and a table of
 * the exact plotted values. Both are built from the same rows as the chart, so they cannot drift.
 */

type ChartTableColumn = { label: string; align?: 'left' | 'right' };

type ChartTableRow = { key: string; cells: readonly string[]; estimated?: boolean };

export type ChartAlternative = {
  /** Read by assistive technology with the chart, not shown. */
  summary: string;
  /** Names the table, such as "Net worth growth values". */
  caption: string;
  columns: readonly ChartTableColumn[];
  rows: readonly ChartTableRow[];
  /** Shown under the table, such as how estimated rows are marked. */
  note?: string;
};

export const NO_VALUE = 'No value';
export const ESTIMATED_MARK = 'Estimated';

export type SeriesColumn<T> = {
  label: string;
  value: (row: T) => number | null | undefined;
  format: (value: number) => string;
};

type BuildOptions<T> = {
  /** Names the chart in the summary and the caption, such as "Net worth growth". */
  subject: string;
  /** Names the first table column, such as "Month". */
  xLabel: string;
  x: (row: T) => string;
  columns: readonly SeriesColumn<T>[];
  rows: readonly T[];
  /** Rows plotted from estimated or fallback data; the table and summary say so. */
  estimated?: (row: T) => boolean;
  /** False for categories (budget lines), where "from first to last" and "latest" mean nothing. */
  ordered?: boolean;
  /** Replaces the generated summary, for charts the generator cannot describe. */
  summary?: string;
  note?: string;
};

function isPlotted(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function describeColumn<T>(
  column: SeriesColumn<T>,
  rows: readonly T[],
  x: (row: T) => string,
  ordered: boolean,
  named: boolean,
): string {
  const lead = named ? `${column.label}: ` : '';
  const plotted = rows
    .map((row) => ({ at: x(row), value: column.value(row) }))
    .filter((point): point is { at: string; value: number } => isPlotted(point.value));
  if (plotted.length === 0) return `${lead}no values.`;
  let low = plotted[0];
  let high = plotted[0];
  for (const point of plotted) {
    if (point.value < low.value) low = point;
    if (point.value > high.value) high = point;
  }
  const parts: string[] = [];
  if (ordered) parts.push(`latest ${column.format(plotted[plotted.length - 1].value)}`);
  parts.push(`lowest ${column.format(low.value)} at ${low.at}`);
  parts.push(`highest ${column.format(high.value)} at ${high.at}`);
  const missing = rows.length - plotted.length;
  if (missing > 0) parts.push(`${missing} without a value`);
  return `${lead}${parts.join(', ')}.`;
}

function buildRows<T>(
  rows: readonly T[],
  x: (row: T) => string,
  columns: readonly SeriesColumn<T>[],
  estimated: ((row: T) => boolean) | undefined,
  withStatus: boolean,
): ChartTableRow[] {
  return rows.map((row, index): ChartTableRow => {
    const isEstimated = Boolean(estimated?.(row));
    const status = isEstimated ? ESTIMATED_MARK : '';
    return {
      key: `${index}-${x(row)}`,
      estimated: isEstimated,
      cells: [
        x(row),
        ...columns.map((column) => {
          const value = column.value(row);
          return isPlotted(value) ? column.format(value) : NO_VALUE;
        }),
        ...(withStatus ? [status] : []),
      ],
    };
  });
}

function buildSummary<T>(options: BuildOptions<T>, estimatedCount: number): string {
  const { subject, rows, x, columns, ordered = true } = options;
  if (rows.length === 0) return `${subject}: no data.`;
  const span =
    ordered && rows.length > 1 ? ` from ${x(rows[0])} to ${x(rows[rows.length - 1])}` : '';
  return [
    `${subject}: ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}${span}.`,
    ...columns.map((column) => describeColumn(column, rows, x, ordered, columns.length > 1)),
    estimatedCount > 0
      ? `${estimatedCount} of ${rows.length} entries are estimated from fallback prices or rates.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Builds the summary and the exact-value table of a chart from the rows it plots. */
export function buildChartAlternative<T>(options: BuildOptions<T>): ChartAlternative {
  const { subject, xLabel, x, columns, rows, estimated, summary, note } = options;
  const estimatedCount = estimated ? rows.filter(estimated).length : 0;
  const hasEstimates = estimatedCount > 0;
  return {
    summary: summary ?? buildSummary(options, estimatedCount),
    caption: `${subject} values`,
    columns: [
      { label: xLabel },
      ...columns.map((column) => ({ label: column.label, align: 'right' as const })),
      ...(hasEstimates ? [{ label: 'Status' }] : []),
    ],
    rows: buildRows(rows, x, columns, estimated, hasEstimates),
    note: note ?? (hasEstimates ? 'Estimated rows use fallback prices or rates.' : undefined),
  };
}

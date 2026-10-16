/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChartCard } from './ChartCard';
import { buildChartAlternative, ESTIMATED_MARK, NO_VALUE } from './chartAlternative';

type Row = { month: string; value: number | null; estimated?: boolean };

const money = (value: number) => `€${value.toFixed(2)}`;
const rows: Row[] = [
  { month: 'Aug', value: 100 },
  { month: 'Sep', value: -250.5, estimated: true },
  { month: 'Oct', value: null },
  { month: 'Nov', value: 400 },
];

const build = (overrides: Partial<Parameters<typeof buildChartAlternative<Row>>[0]> = {}) =>
  buildChartAlternative<Row>({
    subject: 'Net worth',
    xLabel: 'Month',
    x: (row) => row.month,
    rows,
    columns: [{ label: 'Value', value: (row) => row.value, format: money }],
    estimated: (row) => Boolean(row.estimated),
    ...overrides,
  });

describe('buildChartAlternative', () => {
  test('summarises the span, latest, low and high values, gaps and estimates', () => {
    const { summary } = build();
    expect(summary).toContain('4 entries from Aug to Nov');
    expect(summary).toContain('latest €400.00');
    expect(summary).toContain('lowest €-250.50 at Sep');
    expect(summary).toContain('highest €400.00 at Nov');
    expect(summary).toContain('1 without a value');
    expect(summary).toContain('1 of 4 entries are estimated');
  });

  test('names the series in the summary only when there are several', () => {
    expect(build().summary).not.toContain('Value:');
    const two = build({
      columns: [
        { label: 'Value', value: (row) => row.value, format: money },
        { label: 'Other', value: (row) => row.value, format: money },
      ],
    });
    expect(two.summary).toContain('Value: latest');
    expect(two.summary).toContain('Other: latest');
  });

  test('keeps negative, missing and estimated rows in the table instead of zeroing them', () => {
    const table = build();
    expect(table.columns.map((column) => column.label)).toEqual(['Month', 'Value', 'Status']);
    expect(table.rows.map((row) => row.cells)).toEqual([
      ['Aug', '€100.00', ''],
      ['Sep', '€-250.50', ESTIMATED_MARK],
      ['Oct', NO_VALUE, ''],
      ['Nov', '€400.00', ''],
    ]);
    expect(table.note).toContain('Estimated');
  });

  test('has no status column and no estimate sentence when nothing is estimated', () => {
    const table = build({ estimated: undefined });
    expect(table.columns.map((column) => column.label)).toEqual(['Month', 'Value']);
    expect(table.summary).not.toContain('estimated');
    expect(table.note).toBeUndefined();
  });

  test('unordered categories skip the span and the latest value', () => {
    const { summary } = build({ ordered: false });
    expect(summary).not.toContain(' from Aug');
    expect(summary).not.toContain('latest');
  });

  test('says so when there is no data', () => {
    const empty = build({ rows: [] });
    expect(empty.summary).toBe('Net worth: no data.');
    expect(empty.rows).toEqual([]);
  });
});

describe('ChartCard alternative', () => {
  const markup = renderToStaticMarkup(
    <ChartCard title="Net worth growth" hasData alternative={build()}>
      <svg />
    </ChartCard>,
  );

  test('labels the chart group and describes it with the summary', () => {
    expect(markup).toMatch(/role="group"[^>]*aria-label="Net worth growth"/);
    const describedBy = /aria-describedby="([^"]+)"/.exec(markup)?.[1];
    expect(describedBy).toBeTruthy();
    expect(markup).toContain(`<p id="${describedBy}" class="sr-only">Net worth: 4 entries`);
  });

  test('offers the exact values in a labelled table behind a disclosure', () => {
    expect(markup).toContain('<details');
    expect(markup).toContain('Show values');
    expect(markup).toContain('<caption');
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
    expect(markup).toContain('No value');
    expect(markup).toContain('Estimated');
    expect(markup).toMatch(/role="region"[^>]*tabindex="0"/);
  });

  test('renders no group or table without an alternative or without rows', () => {
    const plain = renderToStaticMarkup(
      <ChartCard title="Plain" hasData>
        <svg />
      </ChartCard>,
    );
    expect(plain).not.toContain('<details');
    const noRows = renderToStaticMarkup(
      <ChartCard title="Empty" hasData alternative={build({ rows: [] })}>
        <svg />
      </ChartCard>,
    );
    expect(noRows).not.toContain('<table');
  });
});

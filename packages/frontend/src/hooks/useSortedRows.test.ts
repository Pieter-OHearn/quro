/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import type { DataTableColumn } from '@/components/ui';
import { newestFirst, sortRows } from './useSortedRows';

type Row = { id: number; date: string; name: string; amount: number };
const rows: Row[] = [
  { id: 1, date: '2026-01-01', name: 'Beta', amount: 20 },
  { id: 2, date: '2026-02-01', name: 'Alpha', amount: -5 },
  { id: 3, date: '2026-02-01', name: 'Alpha', amount: 20 },
];
const columns: DataTableColumn<Row>[] = [
  { key: 'amount', sortValue: (row) => row.amount },
  { key: 'name', sortValue: (row) => row.name },
];
test('numeric sorting preserves signed amounts and newest-first ties in either direction', () => {
  expect(
    sortRows(rows, columns, { columnKey: 'amount', direction: 'asc' }, newestFirst).map(
      (row) => row.id,
    ),
  ).toEqual([2, 3, 1]);
  expect(
    sortRows(rows, columns, { columnKey: 'amount', direction: 'desc' }, newestFirst).map(
      (row) => row.id,
    ),
  ).toEqual([3, 1, 2]);
  expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
});
test('text sorting keeps equal values stable unless the table supplies a tie-breaker', () => {
  expect(
    sortRows(rows, columns, { columnKey: 'name', direction: 'asc' }).map((row) => row.id),
  ).toEqual([2, 3, 1]);
  expect(
    sortRows(rows, columns, { columnKey: 'name', direction: 'desc' }, newestFirst).map(
      (row) => row.id,
    ),
  ).toEqual([1, 3, 2]);
});
test('computes each selected sort value once and leaves unknown columns in source order', () => {
  let calls = 0;
  const metrics: DataTableColumn<Row>[] = [
    {
      key: 'metric',
      sortValue: (row) => {
        calls++;
        return row.amount;
      },
    },
  ];
  sortRows(rows, metrics, { columnKey: 'metric', direction: 'desc' });
  expect(calls).toBe(rows.length);
  const result = sortRows(rows, metrics, { columnKey: 'actions', direction: 'asc' });
  expect(result).toEqual(rows);
  expect(result).not.toBe(rows);
});

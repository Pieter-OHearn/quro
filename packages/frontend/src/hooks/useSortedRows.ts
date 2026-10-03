import { useMemo } from 'react';
import type { DataTableColumn, DataTableSortState } from '@/components/ui';

export function sortRows<Row>(
  rows: readonly Row[],
  columns: readonly DataTableColumn<Row>[],
  sort: DataTableSortState,
  tieBreak?: (left: Row, right: Row) => number,
): Row[] {
  const sortValue = columns.find((column) => column.key === sort.columnKey)?.sortValue;
  if (!sortValue) return [...rows];
  const direction = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row) => ({ row, value: sortValue(row) }))
    .sort((left, right) => {
      const comparison =
        typeof left.value === 'string' && typeof right.value === 'string'
          ? left.value.localeCompare(right.value)
          : Number(left.value) - Number(right.value);
      return comparison * direction || tieBreak?.(left.row, right.row) || 0;
    })
    .map(({ row }) => row);
}

export function useSortedRows<Row>(
  rows: readonly Row[],
  columns: readonly DataTableColumn<Row>[],
  sort: DataTableSortState,
  tieBreak?: (left: Row, right: Row) => number,
): Row[] {
  return useMemo(() => sortRows(rows, columns, sort, tieBreak), [rows, columns, sort, tieBreak]);
}

export function newestFirst(
  left: { date: string; id: number },
  right: { date: string; id: number },
) {
  return right.date.localeCompare(left.date) || right.id - left.id;
}

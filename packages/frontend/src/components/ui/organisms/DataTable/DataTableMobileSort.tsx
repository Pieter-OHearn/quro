import { ArrowDown, ArrowUp } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { SelectInput } from '../../atoms';
import type { DataTableColumn, DataTableSortDirection, DataTableSortState } from './DataTable';

type DataTableMobileSortProps = {
  columns: readonly DataTableColumn[];
  sort?: DataTableSortState;
  onSortChange: (sort: DataTableSortState) => void;
};

function columnLabel(column: DataTableColumn): string {
  const label: ReactNode = column.header ?? column.mobileLabel ?? column.key;
  return typeof label === 'string' || typeof label === 'number' ? String(label) : column.key;
}

/**
 * Below 768px the table renders as cards and its header row, the usual place to sort, is hidden.
 * This control stands in for it: a select that picks the sorted column and a button that flips the
 * direction. It uses the same sort state as the header buttons, so both reach the same result.
 */
export function DataTableMobileSort({ columns, sort, onSortChange }: DataTableMobileSortProps) {
  const selectId = useId();
  const sortable = columns.filter((column) => column.sortable);
  if (sortable.length === 0) return null;

  const active = sortable.find((column) => column.key === sort?.columnKey);
  const direction: DataTableSortDirection = sort && active ? sort.direction : 'asc';
  const setDirection = (next: DataTableSortDirection) => {
    const column = active ?? sortable[0];
    onSortChange({ columnKey: column.key, direction: next });
  };
  const flipped = direction === 'asc' ? 'desc' : 'asc';

  return (
    <div className="flex items-center gap-2 border-b border-border-default px-3 py-2 md:hidden max-sm:px-4">
      <label htmlFor={selectId} className="shrink-0 text-label text-fg-muted">
        Sort by
      </label>
      <SelectInput
        id={selectId}
        className="min-w-0 flex-1"
        value={active?.key ?? ''}
        onChange={(columnKey) => {
          const column = sortable.find((candidate) => candidate.key === columnKey);
          if (column) {
            onSortChange({ columnKey, direction: column.defaultSortDirection ?? 'asc' });
          }
        }}
        options={[
          ...(active ? [] : [{ value: '', label: 'Default order', disabled: true }]),
          ...sortable.map((column) => ({ value: column.key, label: columnLabel(column) })),
        ]}
      />
      <button
        type="button"
        onClick={() => setDirection(flipped)}
        aria-label={
          direction === 'asc'
            ? 'Sorted ascending, sort descending'
            : 'Sorted descending, sort ascending'
        }
        className="inline-flex h-8 w-8 shrink-0 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-md border border-border-control bg-surface text-fg-muted transition-colors duration-fast hover:bg-surface-muted hover:text-fg active:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      >
        {direction === 'asc' ? (
          <ArrowUp size={14} aria-hidden />
        ) : (
          <ArrowDown size={14} aria-hidden />
        )}
      </button>
    </div>
  );
}

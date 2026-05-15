import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '../../atoms';
import { PanelHeader } from '../../molecules';

const ALIGNMENT_CLASSES = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

const PRIORITY_CLASSES = {
  primary: '',
  secondary: 'max-md:hidden',
  tertiary: 'max-md:hidden',
  actions: '',
} as const;

const DENSITY_CLASSES = {
  default: {
    header: 'px-4 py-3',
    cell: 'px-4 py-3 max-md:px-0 max-md:py-2',
    body: 'max-md:p-3',
  },
  compact: {
    header: 'px-3 py-2',
    cell: 'px-3 py-2.5 max-md:px-0 max-md:py-1.5',
    body: 'max-md:p-2',
  },
} as const;

const TABLE_VARIANT_CLASSES = {
  default: {
    header: 'bg-surface-sunken/60',
    row: '',
    cell: '',
  },
  financial: {
    header: 'bg-surface-sunken/60',
    row: '',
    cell: '',
  },
  editable: {
    header: 'bg-surface-sunken',
    row: 'align-top',
    cell: 'align-top',
  },
  expandable: {
    header: 'bg-surface-sunken/60',
    row: '',
    cell: '',
  },
} as const;

export type DataTableColumn = {
  key: string;
  header?: ReactNode;
  align?: keyof typeof ALIGNMENT_CLASSES;
  width?: number | string;
  priority?: keyof typeof PRIORITY_CLASSES;
  mobileLabel?: ReactNode;
  numeric?: boolean;
  sortable?: boolean;
  defaultSortDirection?: DataTableSortDirection;
  headerClassName?: string;
  cellClassName?: string;
};

export type DataTableSortDirection = 'asc' | 'desc';

export type DataTableSortState = {
  columnKey: string;
  direction: DataTableSortDirection;
};

export type DataTableProps = {
  variant?: 'card' | 'plain';
  density?: keyof typeof DENSITY_CLASSES;
  tableVariant?: keyof typeof TABLE_VARIANT_CLASSES;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  toolbar?: ReactNode;
  filters?: ReactNode;
  footer?: ReactNode;
  columns: readonly DataTableColumn[];
  children?: ReactNode;
  isEmpty?: boolean;
  isLoading?: boolean;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
  colGroup?: ReactNode;
  sort?: DataTableSortState;
  onSortChange?: (sort: DataTableSortState) => void;
  minWidth?: number | string;
  tableLayout?: 'auto' | 'fixed';
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  tableClassName?: string;
};

export type DataTableRowProps = ComponentPropsWithoutRef<'tr'> & {
  selected?: boolean;
  interactive?: boolean;
};

export type DataTableCellProps = ComponentPropsWithoutRef<'td'> & {
  columnKey?: string;
  align?: keyof typeof ALIGNMENT_CLASSES;
  mobileLabel?: ReactNode;
  priority?: keyof typeof PRIORITY_CLASSES;
  numeric?: boolean;
  contentClassName?: string;
};

type DataTableContextValue = {
  columnsByKey: ReadonlyMap<string, DataTableColumn>;
  density: keyof typeof DENSITY_CLASSES;
  tableVariant: keyof typeof TABLE_VARIANT_CLASSES;
};

type ResolvedCellConfig = {
  align: keyof typeof ALIGNMENT_CLASSES;
  priority: keyof typeof PRIORITY_CLASSES;
  mobileLabel?: ReactNode;
  numeric: boolean;
  columnClassName?: string;
  density: keyof typeof DENSITY_CLASSES;
  tableVariant: keyof typeof TABLE_VARIANT_CLASSES;
};

const DataTableContext = createContext<DataTableContextValue | null>(null);

function useDataTableContext() {
  return useContext(DataTableContext);
}

function getTableStyle(minWidth?: number | string): CSSProperties | undefined {
  if (typeof minWidth === 'undefined') return undefined;

  return {
    '--datatable-min-width': typeof minWidth === 'number' ? `${minWidth}px` : minWidth,
  } as CSSProperties;
}

function getColumnStyle(width?: number | string): CSSProperties | undefined {
  if (typeof width === 'undefined') return undefined;

  return {
    width: typeof width === 'number' ? `${width}px` : width,
  };
}

function getColumnDataLabel(label: ReactNode): string | undefined {
  if (typeof label === 'string') return label;
  if (typeof label === 'number') return String(label);
  return undefined;
}

// Optional column overrides intentionally collapse several table configuration paths.
// eslint-disable-next-line complexity
function resolveCellConfig({
  tableContext,
  columnKey,
  align,
  mobileLabel,
  priority,
  numeric,
}: Pick<DataTableCellProps, 'align' | 'columnKey' | 'mobileLabel' | 'numeric' | 'priority'> & {
  tableContext: DataTableContextValue | null;
}): ResolvedCellConfig {
  const column = columnKey ? tableContext?.columnsByKey.get(columnKey) : undefined;

  return {
    align: align ?? column?.align ?? 'left',
    priority: priority ?? column?.priority ?? 'primary',
    mobileLabel: mobileLabel ?? column?.mobileLabel ?? column?.header,
    numeric: numeric ?? column?.numeric ?? false,
    columnClassName: column?.cellClassName,
    density: tableContext?.density ?? 'default',
    tableVariant: tableContext?.tableVariant ?? 'default',
  };
}

export function DataTableRow({
  selected = false,
  interactive = false,
  className,
  children,
  onClick,
  onKeyDown,
  tabIndex,
  ...props
}: Readonly<DataTableRowProps>) {
  const tableContext = useDataTableContext();
  const tableVariant = tableContext?.tableVariant ?? 'default';
  const isKeyboardInteractive = interactive && onClick;

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || !isKeyboardInteractive) return;
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    event.currentTarget.click();
  }

  return (
    <tr
      className={cn(
        'group border-b border-border-subtle transition-colors max-md:block max-md:rounded-lg max-md:border max-md:border-border-subtle max-md:bg-surface max-md:p-3 max-md:shadow-card',
        TABLE_VARIANT_CLASSES[tableVariant].row,
        interactive && 'cursor-pointer hover:bg-surface-sunken',
        selected && 'bg-brand-soft',
        className,
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={isKeyboardInteractive ? (tabIndex ?? 0) : tabIndex}
      {...props}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  columnKey,
  align,
  mobileLabel,
  priority,
  numeric,
  className,
  contentClassName,
  children,
  ...props
}: Readonly<DataTableCellProps>) {
  const cellConfig = resolveCellConfig({
    tableContext: useDataTableContext(),
    columnKey,
    align,
    mobileLabel,
    priority,
    numeric,
  });

  return (
    <td
      className={cn(
        'max-md:flex max-md:items-start max-md:justify-between max-md:gap-4 max-md:border-0',
        DENSITY_CLASSES[cellConfig.density].cell,
        TABLE_VARIANT_CLASSES[cellConfig.tableVariant].cell,
        ALIGNMENT_CLASSES[cellConfig.align],
        PRIORITY_CLASSES[cellConfig.priority],
        cellConfig.numeric && 'font-numeric',
        cellConfig.columnClassName,
        className,
      )}
      {...props}
    >
      {cellConfig.mobileLabel ? (
        <span className="hidden shrink-0 text-xs font-medium uppercase text-fg-faint max-md:block">
          {cellConfig.mobileLabel}
        </span>
      ) : null}
      <div
        className={cn('min-w-0', cellConfig.align === 'right' && 'md:text-right', contentClassName)}
      >
        {children}
      </div>
    </td>
  );
}

type DataTableHeaderProps = Pick<DataTableProps, 'columns'> &
  Pick<DataTableProps, 'onSortChange' | 'sort'> &
  Required<Pick<DataTableProps, 'density' | 'tableVariant'>>;

function getNextSort(column: DataTableColumn, sort?: DataTableSortState): DataTableSortState {
  if (sort?.columnKey !== column.key) {
    return {
      columnKey: column.key,
      direction: column.defaultSortDirection ?? 'asc',
    };
  }

  return {
    columnKey: column.key,
    direction: sort.direction === 'asc' ? 'desc' : 'asc',
  };
}

function getSortLabel(column: DataTableColumn, sort?: DataTableSortState): string {
  const label = getColumnDataLabel(column.header ?? column.mobileLabel ?? column.key) ?? column.key;
  if (sort?.columnKey !== column.key) return `Sort by ${label}`;
  return `Sort by ${label} ${sort.direction === 'asc' ? 'descending' : 'ascending'}`;
}

function SortIcon({
  isActive,
  direction,
}: Readonly<{
  isActive: boolean;
  direction?: DataTableSortDirection;
}>) {
  if (!isActive) return <ArrowUpDown size={9} className="opacity-25" aria-hidden />;
  if (direction === 'asc') return <ArrowUp size={10} className="opacity-60" aria-hidden />;
  return <ArrowDown size={10} className="opacity-60" aria-hidden />;
}

function getHeaderAriaSort(column: DataTableColumn, sort?: DataTableSortState) {
  if (!column.sortable) return undefined;
  if (sort?.columnKey !== column.key) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

type DataTableHeaderCellProps = {
  column: DataTableColumn;
  density: keyof typeof DENSITY_CLASSES;
  onSortChange?: (sort: DataTableSortState) => void;
  sort?: DataTableSortState;
};

function DataTableHeaderCell({
  column,
  density,
  onSortChange,
  sort,
}: Readonly<DataTableHeaderCellProps>) {
  return (
    <th
      scope="col"
      aria-sort={getHeaderAriaSort(column, sort)}
      style={getColumnStyle(column.width)}
      data-priority={column.priority ?? 'primary'}
      data-mobile-label={getColumnDataLabel(column.mobileLabel)}
      className={cn(
        'text-xs font-semibold uppercase tracking-wide text-fg-faint whitespace-nowrap',
        DENSITY_CLASSES[density].header,
        ALIGNMENT_CLASSES[column.align ?? 'left'],
        column.numeric && 'font-numeric',
        column.headerClassName,
      )}
    >
      {column.sortable && onSortChange ? (
        <button
          type="button"
          aria-label={getSortLabel(column, sort)}
          onClick={() => onSortChange(getNextSort(column, sort))}
          className={cn(
            'inline-flex max-w-full items-center gap-0.5 text-xs font-semibold uppercase tracking-wide leading-none text-inherit transition-colors hover:text-fg-muted focus-visible:outline-none focus-visible:text-fg-muted',
            sort?.columnKey === column.key && 'text-fg-muted',
          )}
        >
          <span className="truncate">{column.header}</span>
          <SortIcon isActive={sort?.columnKey === column.key} direction={sort?.direction} />
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

function DataTableHeader({
  columns,
  density,
  onSortChange,
  sort,
  tableVariant,
}: DataTableHeaderProps) {
  return (
    <thead className="max-md:hidden">
      <tr
        className={cn('border-b border-border-subtle', TABLE_VARIANT_CLASSES[tableVariant].header)}
      >
        {columns.map((column) => (
          <DataTableHeaderCell
            key={column.key}
            column={column}
            density={density}
            onSortChange={onSortChange}
            sort={sort}
          />
        ))}
      </tr>
    </thead>
  );
}

type DataTableBodyProps = Pick<
  DataTableProps,
  'children' | 'columns' | 'emptyState' | 'isEmpty' | 'isLoading' | 'loadingState'
> &
  Required<Pick<DataTableProps, 'density'>>;

function DataTableBody({
  children,
  columns,
  density,
  emptyState,
  isEmpty,
  isLoading,
  loadingState,
}: DataTableBodyProps) {
  if (isLoading) {
    return (
      <tbody className={cn('max-md:block max-md:space-y-3', DENSITY_CLASSES[density].body)}>
        <tr>
          <td
            colSpan={columns.length}
            className="px-4 py-12 text-center text-sm text-fg-faint"
            role="status"
          >
            {loadingState}
          </td>
        </tr>
      </tbody>
    );
  }

  if (isEmpty) {
    return (
      <tbody className={cn('max-md:block max-md:space-y-3', DENSITY_CLASSES[density].body)}>
        <tr>
          <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-fg-faint">
            {emptyState}
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody className={cn('max-md:block max-md:space-y-3', DENSITY_CLASSES[density].body)}>
      {children}
    </tbody>
  );
}

type DataTableElementProps = Pick<
  DataTableProps,
  | 'bodyClassName'
  | 'children'
  | 'colGroup'
  | 'columns'
  | 'emptyState'
  | 'isEmpty'
  | 'isLoading'
  | 'loadingState'
  | 'minWidth'
  | 'onSortChange'
  | 'sort'
  | 'tableClassName'
  | 'tableLayout'
> &
  Required<Pick<DataTableProps, 'density' | 'tableVariant'>>;

function DataTableElement({
  bodyClassName,
  children,
  colGroup,
  columns,
  density,
  emptyState,
  isEmpty,
  isLoading,
  loadingState,
  minWidth,
  onSortChange,
  sort,
  tableClassName,
  tableLayout,
  tableVariant,
}: DataTableElementProps) {
  return (
    <div className={cn('overflow-visible md:overflow-x-auto', bodyClassName)}>
      <table
        className={cn(
          'w-full text-sm max-md:block',
          typeof minWidth !== 'undefined' && 'md:min-w-[var(--datatable-min-width)]',
          tableLayout === 'fixed' && 'table-fixed',
          tableClassName,
        )}
        style={getTableStyle(minWidth)}
      >
        {colGroup}
        <DataTableHeader
          columns={columns}
          density={density}
          onSortChange={onSortChange}
          sort={sort}
          tableVariant={tableVariant}
        />
        <DataTableBody
          columns={columns}
          density={density}
          emptyState={emptyState}
          isEmpty={isEmpty}
          isLoading={isLoading}
          loadingState={loadingState}
        >
          {children}
        </DataTableBody>
      </table>
    </div>
  );
}

function DataTableContent({
  action,
  bodyClassName,
  children,
  colGroup,
  columns,
  density,
  emptyState,
  filters,
  footer,
  headerClassName,
  isEmpty,
  isLoading,
  loadingState,
  minWidth,
  onSortChange,
  sort,
  subtitle,
  tableClassName,
  tableLayout,
  tableVariant,
  title,
  toolbar,
}: Required<Pick<DataTableProps, 'density' | 'tableVariant'>> & DataTableProps) {
  const hasHeader = title || subtitle || action;

  return (
    <DataTableContext.Provider
      value={{
        columnsByKey: new Map(columns.map((column) => [column.key, column])),
        density,
        tableVariant,
      }}
    >
      {hasHeader ? (
        <PanelHeader
          title={title}
          subtitle={subtitle}
          action={action}
          className={headerClassName}
        />
      ) : null}

      {toolbar ? <div className="border-t border-border-subtle px-4 py-3">{toolbar}</div> : null}
      {filters ? (
        <div className="border-t border-border-subtle bg-surface-sunken/40 px-4 py-3">
          {filters}
        </div>
      ) : null}

      <DataTableElement
        bodyClassName={bodyClassName}
        colGroup={colGroup}
        columns={columns}
        density={density}
        emptyState={emptyState}
        isEmpty={isEmpty}
        isLoading={isLoading}
        loadingState={loadingState}
        minWidth={minWidth}
        onSortChange={onSortChange}
        sort={sort}
        tableClassName={tableClassName}
        tableLayout={tableLayout}
        tableVariant={tableVariant}
      >
        {children}
      </DataTableElement>

      {footer ? <div className="border-t border-border-subtle px-4 py-3">{footer}</div> : null}
    </DataTableContext.Provider>
  );
}

export function DataTable({
  variant = 'card',
  density = 'default',
  tableVariant = 'default',
  emptyState = 'No data yet.',
  isEmpty = false,
  isLoading = false,
  loadingState = 'Loading data...',
  tableLayout = 'auto',
  className,
  ...props
}: Readonly<DataTableProps>) {
  const content = (
    <DataTableContent
      density={density}
      emptyState={emptyState}
      isEmpty={isEmpty}
      isLoading={isLoading}
      loadingState={loadingState}
      tableLayout={tableLayout}
      tableVariant={tableVariant}
      {...props}
    />
  );

  if (variant === 'plain') {
    return <div className={cn('overflow-hidden', className)}>{content}</div>;
  }

  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      {content}
    </Card>
  );
}

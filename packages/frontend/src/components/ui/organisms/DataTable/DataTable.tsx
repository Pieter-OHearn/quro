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

// Rows are 28px (compact, the default) or 36px on desktop. Below the medium breakpoint rows
// render as cards whose lines are at least 36px, and 48px below 640px.
const DENSITY_CLASSES = {
  default: { row: 'md:h-9' },
  compact: { row: 'md:h-7' },
} as const;

const TABLE_VARIANT_CLASSES = {
  default: { row: '', cell: 'md:py-0' },
  financial: { row: '', cell: 'md:py-0' },
  editable: { row: 'align-top', cell: 'align-top md:py-1' },
  expandable: { row: '', cell: 'md:py-0' },
} as const;

const MOBILE_CARD_CLASS_NAME =
  'max-md:rounded-lg max-md:border max-md:border-border-default max-md:bg-surface max-md:px-3 max-sm:rounded-xl max-sm:px-4';
const MOBILE_CELL_CLASS_NAME =
  'max-md:flex max-md:min-h-9 max-md:items-center max-md:justify-between max-md:gap-4 max-md:border-0 max-md:px-0 max-md:py-1.5 max-sm:min-h-12';

export type DataTableColumn<Row = never> = {
  key: string;
  header?: ReactNode;
  align?: keyof typeof ALIGNMENT_CLASSES;
  width?: number | string;
  priority?: keyof typeof PRIORITY_CLASSES;
  mobileLabel?: ReactNode;
  numeric?: boolean;
  sortable?: boolean;
  sortValue?(row: Row): string | number;
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
  mobileCard?: boolean;
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

// Numbers are right-aligned unless the column says otherwise.
function getColumnAlign(column: DataTableColumn): keyof typeof ALIGNMENT_CLASSES {
  return column.align ?? (column.numeric ? 'right' : 'left');
}

function getRowTabIndex(isKeyboardInteractive: boolean, tabIndex: DataTableRowProps['tabIndex']) {
  if (!isKeyboardInteractive) return tabIndex;
  return tabIndex ?? 0;
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
  const resolvedNumeric = numeric ?? column?.numeric ?? false;

  return {
    // Numbers are right-aligned unless the column says otherwise.
    align: align ?? column?.align ?? (resolvedNumeric ? 'right' : 'left'),
    priority: priority ?? column?.priority ?? 'primary',
    mobileLabel: mobileLabel ?? column?.mobileLabel ?? column?.header,
    numeric: resolvedNumeric,
    columnClassName: column?.cellClassName,
    tableVariant: tableContext?.tableVariant ?? 'default',
  };
}

function getRowClassName({
  density,
  tableVariant,
  mobileCard,
  interactive,
  selected,
  className,
}: Required<Pick<DataTableRowProps, 'mobileCard' | 'interactive' | 'selected'>> & {
  density: keyof typeof DENSITY_CLASSES;
  tableVariant: keyof typeof TABLE_VARIANT_CLASSES;
  className?: string;
}) {
  return cn(
    'group border-b border-border-subtle transition-colors duration-fast md:last:border-b-0 md:hover:bg-surface-muted max-md:block',
    DENSITY_CLASSES[density].row,
    mobileCard && MOBILE_CARD_CLASS_NAME,
    TABLE_VARIANT_CLASSES[tableVariant].row,
    // A total row: `<DataTableRow data-total>`.
    'data-total:border-t data-total:border-border-strong data-total:font-semibold',
    interactive &&
      'cursor-pointer active:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
    selected && 'bg-brand-soft md:hover:bg-brand-soft max-md:bg-brand-soft',
    className,
  );
}

export function DataTableRow({
  selected = false,
  interactive = false,
  mobileCard = true,
  className,
  children,
  onClick,
  onKeyDown,
  tabIndex,
  ...props
}: Readonly<DataTableRowProps>) {
  const tableContext = useDataTableContext();
  const isKeyboardInteractive = Boolean(interactive && onClick);

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
      className={getRowClassName({
        density: tableContext?.density ?? 'compact',
        tableVariant: tableContext?.tableVariant ?? 'default',
        mobileCard,
        interactive,
        selected,
        className,
      })}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={getRowTabIndex(isKeyboardInteractive, tabIndex)}
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
        'px-3',
        MOBILE_CELL_CLASS_NAME,
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
        <span className="hidden shrink-0 text-label text-fg-muted max-md:block">
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
  Pick<DataTableProps, 'onSortChange' | 'sort'>;

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
  if (!isActive) return <ArrowUpDown size={12} className="text-fg-faint" aria-hidden />;
  if (direction === 'asc') return <ArrowUp size={12} aria-hidden />;
  return <ArrowDown size={12} aria-hidden />;
}

function getHeaderAriaSort(column: DataTableColumn, sort?: DataTableSortState) {
  if (!column.sortable) return undefined;
  if (sort?.columnKey !== column.key) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

type DataTableHeaderCellProps = {
  column: DataTableColumn;
  onSortChange?: (sort: DataTableSortState) => void;
  sort?: DataTableSortState;
};

function DataTableHeaderCell({ column, onSortChange, sort }: Readonly<DataTableHeaderCellProps>) {
  return (
    <th
      scope="col"
      aria-sort={getHeaderAriaSort(column, sort)}
      style={getColumnStyle(column.width)}
      data-priority={column.priority ?? 'primary'}
      data-mobile-label={getColumnDataLabel(column.mobileLabel)}
      className={cn(
        'h-7 px-3 text-label text-fg-muted whitespace-nowrap',
        ALIGNMENT_CLASSES[getColumnAlign(column)],
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
            'inline-flex max-w-full items-center gap-1 rounded-sm text-label text-inherit transition-colors duration-fast hover:text-fg active:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
            sort?.columnKey === column.key && 'text-fg',
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

function DataTableHeader({ columns, onSortChange, sort }: DataTableHeaderProps) {
  return (
    <thead className="max-md:hidden">
      <tr className="border-b border-border-default">
        {columns.map((column) => (
          <DataTableHeaderCell
            key={column.key}
            column={column}
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
>;

const BODY_CLASS_NAME = 'max-md:block max-md:space-y-2 max-md:p-3';
const MESSAGE_CELL_CLASS_NAME = 'px-3 py-8 text-center text-cell text-fg-subtle';

function DataTableBody({
  children,
  columns,
  emptyState,
  isEmpty,
  isLoading,
  loadingState,
}: DataTableBodyProps) {
  if (isLoading) {
    return (
      <tbody className={BODY_CLASS_NAME}>
        <tr>
          <td colSpan={columns.length} className={MESSAGE_CELL_CLASS_NAME} role="status">
            {loadingState}
          </td>
        </tr>
      </tbody>
    );
  }

  if (isEmpty) {
    return (
      <tbody className={BODY_CLASS_NAME}>
        <tr>
          <td colSpan={columns.length} className={MESSAGE_CELL_CLASS_NAME}>
            {emptyState}
          </td>
        </tr>
      </tbody>
    );
  }

  return <tbody className={BODY_CLASS_NAME}>{children}</tbody>;
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
>;

function DataTableElement({
  bodyClassName,
  children,
  colGroup,
  columns,
  emptyState,
  isEmpty,
  isLoading,
  loadingState,
  minWidth,
  onSortChange,
  sort,
  tableClassName,
  tableLayout,
}: DataTableElementProps) {
  return (
    <div className={cn('overflow-visible md:overflow-x-auto', bodyClassName)}>
      <table
        className={cn(
          'w-full text-cell max-md:block',
          typeof minWidth !== 'undefined' && 'md:min-w-[var(--datatable-min-width)]',
          tableLayout === 'fixed' && 'table-fixed',
          tableClassName,
        )}
        style={getTableStyle(minWidth)}
      >
        {colGroup}
        <DataTableHeader columns={columns} onSortChange={onSortChange} sort={sort} />
        <DataTableBody
          columns={columns}
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

// Toolbar and filters sit between the card header and the table, each above a rule.
const SLOT_CLASS_NAME = 'border-b border-border-default px-3 py-2 max-sm:px-4';

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

      {toolbar ? <div className={SLOT_CLASS_NAME}>{toolbar}</div> : null}
      {filters ? <div className={SLOT_CLASS_NAME}>{filters}</div> : null}

      <DataTableElement
        bodyClassName={bodyClassName}
        colGroup={colGroup}
        columns={columns}
        emptyState={emptyState}
        isEmpty={isEmpty}
        isLoading={isLoading}
        loadingState={loadingState}
        minWidth={minWidth}
        onSortChange={onSortChange}
        sort={sort}
        tableClassName={tableClassName}
        tableLayout={tableLayout}
      >
        {children}
      </DataTableElement>

      {footer ? (
        <div className="border-t border-border-default px-3 py-2 max-sm:px-4">{footer}</div>
      ) : null}
    </DataTableContext.Provider>
  );
}

export function DataTable({
  variant = 'card',
  density = 'compact',
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

import {
  createContext,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '../../atoms';
import { PanelHeader } from '../../molecules';
import { DataTableMobileSort } from './DataTableMobileSort';

const ALIGNMENT_CLASSES = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

// Secondary and tertiary columns are left out of the cards below 768px until the row's details
// are opened (`data-details-open` on the row, set by its "Show details" button).
const HIDDEN_ON_CARD_CLASS_NAME = 'max-md:hidden max-md:group-data-details-open:flex';
const PRIORITY_CLASSES = {
  primary: '',
  secondary: HIDDEN_ON_CARD_CLASS_NAME,
  tertiary: HIDDEN_ON_CARD_CLASS_NAME,
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
// The phone card: a 12-column grid. The title takes 7 columns and the headline 5; the metrics
// share the next rows; the footer holds the actions and the "Show details" button. `order` puts
// the cells in that sequence whatever the column order is.
const PHONE_CARD_CLASS_NAME =
  'max-md:grid max-md:grid-cols-12 max-md:items-start max-md:px-4 max-md:py-3';
const PHONE_CARD_CELL_CLASS_NAME = 'max-md:min-w-0 max-md:p-0 max-md:text-left';
const PHONE_CARD_ROLE_CLASSES = {
  title: 'max-md:order-1 max-md:col-span-7',
  headline: 'max-md:order-2 max-md:col-span-5 max-md:justify-self-end max-md:text-right',
  headlineNote: 'max-md:order-3 max-md:col-span-5 max-md:justify-self-end max-md:text-right',
  metric: 'max-md:order-4 max-md:mt-3',
  hiddenUntilDetails:
    'max-md:order-5 max-md:mt-3 max-md:hidden max-md:group-data-details-open:block',
} as const;
// A label over a value: metrics share a row two (up to four), three or one to a row.
const PHONE_CARD_METRIC_SPAN_CLASSES = {
  1: 'max-md:col-span-12',
  2: 'max-md:col-span-6',
  3: 'max-md:col-span-4',
  4: 'max-md:col-span-6',
} as const;
const PHONE_CARD_FOOTER_CLASS_NAME =
  'max-md:mt-2 max-md:border-t max-md:border-border-subtle max-md:pt-1';
// The footer's icon buttons read as controls on a card: muted rather than the faint resting tint
// of a table row, so the Edit pencil stays visible beside the details button.
const PHONE_CARD_ACTIONS_CLASS_NAME =
  'max-md:[&_a]:text-fg-muted max-md:[&_button:not(:disabled)]:text-fg-muted';
const MOBILE_CELL_CLASS_NAME =
  'max-md:flex max-md:min-h-9 max-md:items-center max-md:justify-between max-md:gap-4 max-md:border-0 max-md:px-0 max-md:py-1.5 max-sm:min-h-12';

/**
 * Where a column's cell goes on the phone card of a table that opts in with `phoneCard` roles.
 * `title`: the identity on the left (name over a caption line). `headline`: the key figure on the
 * right. `headlineNote`: a line under the headline (a gain, say). `metric`: a label over a value in
 * a grid under the header. `hiddenUntilDetails`: a metric the "Show details" button reveals.
 * A column with the `actions` priority becomes the card's footer.
 */
export type DataTablePhoneCardRole =
  'title' | 'headline' | 'headlineNote' | 'metric' | 'hiddenUntilDetails';

export type DataTableColumn<Row = never> = {
  key: string;
  header?: ReactNode;
  align?: keyof typeof ALIGNMENT_CLASSES;
  width?: number | string;
  priority?: keyof typeof PRIORITY_CLASSES;
  mobileLabel?: ReactNode;
  /** Opts the table into the phone card layout; see `DataTablePhoneCardRole`. */
  phoneCard?: DataTablePhoneCardRole;
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
  /** False for a row with nothing to reveal (a total): it gets no "Show details" button. */
  cardDetails?: boolean;
  /**
   * Makes the card's details control controlled, for a row whose expansion elsewhere (a history
   * row under it) should open with the same control. Without it the row keeps its own state.
   */
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
  /** Names the row for assistive technology: "Show details for <label>". */
  detailsLabel?: string;
};

export type DataTableCellProps = ComponentPropsWithoutRef<'td'> & {
  columnKey?: string;
  align?: keyof typeof ALIGNMENT_CLASSES;
  mobileLabel?: ReactNode;
  priority?: keyof typeof PRIORITY_CLASSES;
  numeric?: boolean;
  /** A cell with a caption under its first line: gives the row 6px more room above and below on desktop. */
  stacked?: boolean;
  contentClassName?: string;
};

type DataTableContextValue = {
  /** Whether some column is left out of the cards until a row's details are opened. */
  hasCardDetails: boolean;
  /** Whether the cards use the phone card layout (some column has a `phoneCard` role). */
  phoneCard: boolean;
  /** Whether a column holds a note under the headline figure. */
  hasHeadlineNote: boolean;
  metricCount: number;
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
  phoneCardRole?: DataTablePhoneCardRole;
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
    phoneCardRole: column?.phoneCard,
  };
}

function getRowClassName({
  density,
  tableVariant,
  mobileCard,
  phoneCard,
  interactive,
  selected,
  className,
}: Required<Pick<DataTableRowProps, 'mobileCard' | 'interactive' | 'selected'>> & {
  density: keyof typeof DENSITY_CLASSES;
  tableVariant: keyof typeof TABLE_VARIANT_CLASSES;
  /** The row is a card in the phone card layout. */
  phoneCard: boolean;
  className?: string;
}) {
  return cn(
    'group border-b border-border-subtle transition-colors duration-fast md:last:border-b-0 md:hover:bg-surface-muted',
    phoneCard ? PHONE_CARD_CLASS_NAME : 'max-md:block',
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

// A last cell that only the cards have. It reveals the columns the card leaves out, so nothing
// shown in the table is missing on a phone. It stops the click so an interactive row does not
// also open.
function DataTableDetailsToggle({
  open,
  onToggle,
  phoneCard,
  label,
}: Readonly<{ open: boolean; onToggle: () => void; phoneCard: boolean; label?: string }>) {
  const text = open ? 'Hide details' : 'Show details';
  return (
    <td
      className={cn(
        'hidden max-md:block max-md:pb-1',
        phoneCard &&
          cn(
            'max-md:order-7 max-md:col-span-6 max-md:col-start-7 max-md:pb-0 max-md:text-right',
            PHONE_CARD_FOOTER_CLASS_NAME,
          ),
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={label ? `${text} for ${label}` : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={cn(
          'inline-flex min-h-9 items-center gap-1 text-label text-brand-fg underline-offset-2 hover:underline max-sm:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
          phoneCard && 'max-md:min-h-11',
        )}
      >
        {text}
        <ChevronDown
          size={14}
          aria-hidden
          className={cn('transition-transform duration-fast', open && 'rotate-180')}
        />
      </button>
    </td>
  );
}

function getRowChrome(tableContext: DataTableContextValue | null) {
  return {
    density: tableContext?.density ?? 'compact',
    tableVariant: tableContext?.tableVariant ?? 'default',
  } as const;
}

function useCardDetails(
  tableContext: DataTableContextValue | null,
  {
    mobileCard,
    cardDetails,
    detailsOpen,
    onDetailsOpenChange,
    detailsLabel,
  }: Required<Pick<DataTableRowProps, 'mobileCard' | 'cardDetails'>> &
    Pick<DataTableRowProps, 'detailsOpen' | 'onDetailsOpenChange' | 'detailsLabel'>,
) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = detailsOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (detailsOpen === undefined) setOwnOpen(next);
    onDetailsOpenChange?.(next);
  };
  const phoneCard = Boolean(tableContext?.phoneCard && mobileCard);
  const enabled = Boolean(tableContext?.hasCardDetails && mobileCard && cardDetails);
  return {
    phoneCard,
    rowProps: { 'data-details-open': open ? '' : undefined },
    toggle: enabled ? (
      <DataTableDetailsToggle
        open={open}
        onToggle={() => setOpen(!open)}
        phoneCard={phoneCard}
        label={detailsLabel}
      />
    ) : null,
  };
}

export function DataTableRow({
  selected = false,
  interactive = false,
  mobileCard = true,
  cardDetails = true,
  detailsOpen,
  onDetailsOpenChange,
  detailsLabel,
  className,
  children,
  onClick,
  onKeyDown,
  tabIndex,
  ...props
}: Readonly<DataTableRowProps>) {
  const tableContext = useDataTableContext();
  const isKeyboardInteractive = Boolean(interactive && onClick);
  const details = useCardDetails(tableContext, {
    mobileCard,
    cardDetails,
    detailsOpen,
    onDetailsOpenChange,
    detailsLabel,
  });

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
        ...getRowChrome(tableContext),
        mobileCard,
        phoneCard: details.phoneCard,
        interactive,
        selected,
        className,
      })}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={getRowTabIndex(isKeyboardInteractive, tabIndex)}
      {...details.rowProps}
      {...props}
    >
      {children}
      {details.toggle}
    </tr>
  );
}

function getPhoneCardRole(
  config: ResolvedCellConfig,
): DataTablePhoneCardRole | 'footer' | undefined {
  if (config.phoneCardRole) return config.phoneCardRole;
  return config.priority === 'actions' ? 'footer' : undefined;
}

function getPhoneCardCellClassName(
  role: DataTablePhoneCardRole | 'footer',
  tableContext: DataTableContextValue,
) {
  if (role === 'footer') {
    return cn(
      PHONE_CARD_FOOTER_CLASS_NAME,
      PHONE_CARD_ACTIONS_CLASS_NAME,
      'max-md:order-6 max-md:col-start-1 max-md:block',
      tableContext.hasCardDetails ? 'max-md:col-span-6' : 'max-md:col-span-12',
    );
  }
  if (role === 'title') {
    return cn(PHONE_CARD_ROLE_CLASSES.title, tableContext.hasHeadlineNote && 'max-md:row-span-2');
  }
  if (role === 'metric' || role === 'hiddenUntilDetails') {
    const span =
      PHONE_CARD_METRIC_SPAN_CLASSES[
        tableContext.metricCount as keyof typeof PHONE_CARD_METRIC_SPAN_CLASSES
      ] ?? 'max-md:col-span-4';
    return cn(PHONE_CARD_ROLE_CLASSES[role], span);
  }
  return PHONE_CARD_ROLE_CLASSES[role];
}

// The label of a phone card cell: none for the title and the note, above the value for a metric,
// and for the headline above the figure, or only for assistive technology when a note under it
// says what it is.
function PhoneCardLabel({
  role,
  label,
  hasHeadlineNote,
}: Readonly<{
  role: DataTablePhoneCardRole | 'footer';
  label: ReactNode;
  hasHeadlineNote: boolean;
}>) {
  if (!label || role === 'title' || role === 'headlineNote' || role === 'footer') return null;
  const hidden = role === 'headline' && hasHeadlineNote;
  return (
    <span className={cn('text-label text-fg-muted max-md:block', hidden ? 'sr-only' : 'hidden')}>
      {label}
    </span>
  );
}

function getCellClassName(
  cellConfig: ResolvedCellConfig,
  tableContext: DataTableContextValue | null,
  phoneRole: DataTablePhoneCardRole | 'footer' | undefined,
) {
  return cn(
    'px-3',
    phoneRole ? PHONE_CARD_CELL_CLASS_NAME : MOBILE_CELL_CLASS_NAME,
    TABLE_VARIANT_CLASSES[cellConfig.tableVariant].cell,
    ALIGNMENT_CLASSES[cellConfig.align],
    !phoneRole && PRIORITY_CLASSES[cellConfig.priority],
    phoneRole && tableContext && getPhoneCardCellClassName(phoneRole, tableContext),
    cellConfig.numeric && 'font-numeric',
    cellConfig.columnClassName,
  );
}

function CellLabel({
  phoneRole,
  label,
  hasHeadlineNote,
}: Readonly<{
  phoneRole: DataTablePhoneCardRole | 'footer' | undefined;
  label: ReactNode;
  hasHeadlineNote: boolean;
}>) {
  if (phoneRole) {
    return <PhoneCardLabel role={phoneRole} label={label} hasHeadlineNote={hasHeadlineNote} />;
  }
  if (!label) return null;
  return <span className="hidden shrink-0 text-label text-fg-muted max-md:block">{label}</span>;
}

export function DataTableCell({
  columnKey,
  align,
  mobileLabel,
  priority,
  numeric,
  stacked = false,
  className,
  contentClassName,
  children,
  ...props
}: Readonly<DataTableCellProps>) {
  const tableContext = useDataTableContext();
  const cellConfig = resolveCellConfig({
    tableContext,
    columnKey,
    align,
    mobileLabel,
    priority,
    numeric,
  });
  const phoneRole = tableContext?.phoneCard ? getPhoneCardRole(cellConfig) : undefined;

  return (
    <td
      className={cn(
        getCellClassName(cellConfig, tableContext, phoneRole),
        stacked && 'md:py-1.5',
        className,
      )}
      {...props}
    >
      <CellLabel
        phoneRole={phoneRole}
        label={cellConfig.mobileLabel}
        hasHeadlineNote={Boolean(tableContext?.hasHeadlineNote)}
      />
      <div
        className={cn(
          'min-w-0',
          cellConfig.align === 'right' && 'md:text-right',
          // The first 44px icon button of the footer lines its glyph up with the card's text.
          phoneRole === 'footer' && 'max-md:-ml-3',
          contentClassName,
        )}
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
  const header =
    getColumnDataLabel(column.header ?? column.mobileLabel ?? column.key) ?? column.key;
  // Mid-sentence the header reads in lower case ("Sort by net pay"); acronyms keep their case.
  const label = header.replace(/^([A-Z])(?=[a-z])/, (letter) => letter.toLowerCase());
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
        hasCardDetails: columns.some(
          (column) =>
            column.priority === 'secondary' ||
            column.priority === 'tertiary' ||
            column.phoneCard === 'hiddenUntilDetails',
        ),
        phoneCard: columns.some((column) => column.phoneCard),
        hasHeadlineNote: columns.some((column) => column.phoneCard === 'headlineNote'),
        metricCount: columns.filter((column) => column.phoneCard === 'metric').length,
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
      {onSortChange ? (
        <DataTableMobileSort columns={columns} sort={sort} onSortChange={onSortChange} />
      ) : null}

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

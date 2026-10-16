import type { ReactNode } from 'react';
import { Edit3, Filter, Plus, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { ButtonProps } from '../../atoms';
import { Badge, Button, Card, IconButton } from '../../atoms';
import { PanelHeader, RowActions, SegmentedControl } from '../../molecules';

export type FilterOption = {
  key: string;
  label: string;
};

export type TxnHistoryStat = {
  label: string;
  /** A formatted figure, or a `Change` for a stat that rose or fell. */
  value: ReactNode;
  color?: string;
};

// Both variants are flat: stats, a filter bar and the rows are separated by rules, not boxes.
// `embedded` sits inside another card, `card` brings its own card and header.
const PANEL_VARIANTS = {
  embedded: {
    bodyClassName: 'border-t border-border-default',
    statsClassName: 'px-3 py-2 border-b border-border-subtle max-sm:px-4',
    filterBarClassName: 'px-3 py-2 border-b border-border-subtle max-sm:px-4',
    listClassName: 'divide-y divide-border-subtle',
    emptyStateClassName: 'px-3 py-6 max-sm:px-4',
    addButtonSize: 'sm',
    // Inside an expanded row the page keeps its own primary action, so this one is secondary.
    addButtonVariant: 'secondary',
  },
  card: {
    bodyClassName: '',
    statsClassName: 'px-3 py-2 border-b border-border-subtle max-sm:px-4',
    filterBarClassName: 'px-3 py-2 border-b border-border-subtle max-sm:px-4',
    listClassName: 'divide-y divide-border-subtle',
    emptyStateClassName: 'px-3 py-8 max-sm:px-4',
    addButtonSize: 'md',
    addButtonVariant: 'primary',
  },
} as const;

// Two columns on phones, so five or six stats do not squeeze into 390px.
const GRID_COLUMN_CLASSES = {
  '1': 'grid-cols-1',
  '2': 'grid-cols-2',
  '3': 'grid-cols-2 sm:grid-cols-3',
  '4': 'grid-cols-2 sm:grid-cols-4',
  '5': 'grid-cols-2 sm:grid-cols-5',
} as const;

const DEFAULT_GRID_COLUMN_CLASS = 'grid-cols-2 sm:grid-cols-6';

export type TxnHistoryPanelProps = {
  filterOptions: FilterOption[];
  filter: string;
  onFilterChange: (key: string) => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  stats?: TxnHistoryStat[];
  statsColumns?: number;
  onAdd?: () => void;
  addLabel?: string;
  accentColor?: string;
  variant?: keyof typeof PANEL_VARIANTS;
  addButtonPlacement?: 'filterBar' | 'header';
  addButtonSize?: ButtonProps['size'];
  /** Another action beside the add button, such as an import. */
  secondaryAction?: ReactNode;
  emptyMessage?: string;
  /**
   * Tints every second row with `surface-sunken` and draws a `border-default` rule between rows,
   * for a long history that is read across. Opt in; `surface-muted` hover still wins.
   */
  striped?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  isEmpty: boolean;
};

// `:where()` keeps the stripe at one class of specificity, so a row's hover tint, and a row that
// is marked selected, are never overridden by it.
const STRIPED_LIST_CLASS =
  'divide-y divide-border-default [&>:where(:nth-child(even):not([aria-selected=true]))]:bg-surface-sunken';

type StatsGridProps = {
  stats: TxnHistoryStat[];
  statsColumns?: number;
  className?: string;
};

function StatsGrid({ stats, statsColumns, className }: StatsGridProps) {
  const columns = statsColumns ?? stats.length;
  const columnsClass =
    GRID_COLUMN_CLASSES[String(columns) as keyof typeof GRID_COLUMN_CLASSES] ??
    DEFAULT_GRID_COLUMN_CLASS;

  return (
    <dl className={cn('grid gap-x-4 gap-y-2', columnsClass, className)}>
      {stats.map(({ label, value, color }) => (
        <div key={label} className="min-w-0">
          <dt className="text-label text-fg-muted">{label}</dt>
          <dd className={cn('text-figure-md', color ?? 'text-fg')}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type FilterBarProps = {
  filterOptions: FilterOption[];
  filter: string;
  onFilterChange: (key: string) => void;
  addAction?: ReactNode;
  className?: string;
};

function FilterBar({
  filterOptions,
  filter,
  onFilterChange,
  addAction,
  className,
}: FilterBarProps) {
  // Below 640px the filter takes the full width and the add button wraps below it.
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)}>
      <div className="flex min-w-0 items-center gap-2 max-sm:w-full">
        <span className="flex items-center gap-1 text-label text-fg-muted max-sm:hidden">
          <Filter size={12} className="text-fg-faint" aria-hidden />
          Filter
        </span>
        <SegmentedControl
          aria-label="Filter transactions"
          options={filterOptions.map((option) => ({
            value: option.key,
            label: option.label,
          }))}
          value={filter}
          onChange={onFilterChange}
          variant="soft"
          className="max-sm:w-full"
        />
      </div>
      {addAction ? <div className="max-sm:w-full max-sm:*:w-full">{addAction}</div> : null}
    </div>
  );
}

type AddButtonProps = Pick<
  TxnHistoryPanelProps,
  'onAdd' | 'addLabel' | 'accentColor' | 'addButtonSize'
> & {
  fallbackSize: ButtonProps['size'];
  variant: ButtonProps['variant'];
};

function AddTransactionButton({
  onAdd,
  addLabel = 'Add transaction',
  accentColor,
  addButtonSize,
  fallbackSize,
  variant,
}: AddButtonProps) {
  const resolvedAddButtonSize = addButtonSize ?? fallbackSize;
  const addButtonIconSize = resolvedAddButtonSize === 'sm' ? 12 : 14;

  return (
    <Button
      onClick={onAdd}
      variant={variant}
      size={resolvedAddButtonSize}
      leadingIcon={<Plus size={addButtonIconSize} />}
      className={accentColor}
    >
      {addLabel}
    </Button>
  );
}

type TxnHistoryBodyProps = Pick<
  TxnHistoryPanelProps,
  | 'filterOptions'
  | 'filter'
  | 'onFilterChange'
  | 'stats'
  | 'statsColumns'
  | 'emptyMessage'
  | 'children'
  | 'footer'
  | 'isEmpty'
  | 'onAdd'
  | 'striped'
> & {
  variantStyles: (typeof PANEL_VARIANTS)[keyof typeof PANEL_VARIANTS];
  addAction?: ReactNode;
};

function TxnHistoryBody({
  filterOptions,
  filter,
  onFilterChange,
  stats,
  statsColumns,
  emptyMessage = 'No transactions.',
  children,
  footer,
  isEmpty,
  onAdd,
  striped,
  variantStyles,
  addAction,
}: TxnHistoryBodyProps) {
  const resolvedStats = stats && stats.length > 0 ? stats : undefined;
  const content = isEmpty ? (
    <p className={cn('text-cell text-fg-subtle', variantStyles.emptyStateClassName)}>
      {emptyMessage}
      {onAdd ? (
        <>
          {' '}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-sm font-medium text-brand hover:underline active:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
          >
            Add one
          </button>
        </>
      ) : null}
    </p>
  ) : (
    <>
      <div className={striped ? STRIPED_LIST_CLASS : variantStyles.listClassName}>{children}</div>
      {footer ? (
        <div className="border-t border-border-subtle px-3 py-2 max-sm:px-4">{footer}</div>
      ) : null}
    </>
  );

  return (
    <div className={variantStyles.bodyClassName}>
      {resolvedStats && (
        <StatsGrid
          stats={resolvedStats}
          statsColumns={statsColumns}
          className={variantStyles.statsClassName}
        />
      )}
      <FilterBar
        filterOptions={filterOptions}
        filter={filter}
        onFilterChange={onFilterChange}
        addAction={addAction}
        className={variantStyles.filterBarClassName}
      />
      {content}
    </div>
  );
}

type TxnHistoryCardShellProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
};

function TxnHistoryCardShell({ title, subtitle, action, children }: TxnHistoryCardShellProps) {
  const hasHeader = Boolean(title || subtitle || action);

  if (!hasHeader) {
    return (
      <Card padding="none" className="overflow-hidden">
        {children}
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <PanelHeader title={title ?? ''} subtitle={subtitle} action={action} />
      {children}
    </Card>
  );
}

export function TxnHistoryPanel({
  filterOptions,
  filter,
  onFilterChange,
  title,
  subtitle,
  stats,
  statsColumns,
  onAdd,
  addLabel = 'Add transaction',
  accentColor,
  variant = 'embedded',
  addButtonPlacement = 'filterBar',
  addButtonSize,
  secondaryAction,
  emptyMessage = 'No transactions.',
  striped,
  children,
  footer,
  isEmpty,
}: TxnHistoryPanelProps) {
  const variantStyles = PANEL_VARIANTS[variant];
  const addButton = onAdd ? (
    <AddTransactionButton
      onAdd={onAdd}
      addLabel={addLabel}
      accentColor={accentColor}
      addButtonSize={addButtonSize}
      fallbackSize={variantStyles.addButtonSize}
      variant={variantStyles.addButtonVariant}
    />
  ) : null;
  const actions = secondaryAction ? (
    <div className="flex flex-wrap items-center gap-2 max-sm:flex-col max-sm:items-stretch">
      {secondaryAction}
      {addButton}
    </div>
  ) : (
    addButton
  );
  const filterBarAction = addButtonPlacement === 'filterBar' ? actions : undefined;
  const headerAction = addButtonPlacement === 'header' ? addButton : undefined;
  const body = (
    <TxnHistoryBody
      filterOptions={filterOptions}
      filter={filter}
      onFilterChange={onFilterChange}
      stats={stats}
      statsColumns={statsColumns}
      emptyMessage={emptyMessage}
      footer={footer}
      isEmpty={isEmpty}
      onAdd={onAdd}
      striped={striped}
      variantStyles={variantStyles}
      addAction={filterBarAction}
    >
      {children}
    </TxnHistoryBody>
  );

  if (variant !== 'card') return body;

  return (
    <TxnHistoryCardShell title={title} subtitle={subtitle} action={headerAction}>
      {body}
    </TxnHistoryCardShell>
  );
}

export type TxnRowProps = {
  icon: LucideIcon;
  iconColor: string;
  /** Unused since rows dropped the tinted icon tile; kept optional for existing callers. */
  iconBg?: string;
  iconContainerClassName?: string;
  iconSize?: number;
  label: string;
  labelClassName?: string;
  date: string;
  dateClassName?: string;
  badge?: { text: string; className: string };
  amount: ReactNode;
  onEdit?: () => void;
  onDelete: () => void;
  className?: string;
  actionsClassName?: string;
};

// Dates read "01 Oct 2026".
const TXN_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

/**
 * One transaction on one 28px line on desktop: date, type icon, label, amount and actions.
 * Below 640px the row is 48px with the date under the label and the actions always visible.
 * The caller formats `amount` (sign and colour); the row right-aligns it in tabular figures.
 */
export function TxnRow({
  icon: Icon,
  iconColor,
  iconBg: _iconBg,
  iconContainerClassName,
  iconSize = 14,
  label,
  labelClassName,
  date,
  dateClassName,
  badge,
  amount,
  onEdit,
  onDelete,
  className,
  actionsClassName,
}: TxnRowProps) {
  return (
    <div
      className={cn(
        'group flex min-h-7 items-center gap-2 px-3 text-cell transition-colors duration-fast hover:bg-surface-muted max-sm:min-h-12 max-sm:px-4',
        className,
      )}
    >
      <span
        className={cn('flex shrink-0 items-center justify-center', iconContainerClassName)}
        aria-hidden
      >
        <Icon size={iconSize} className={iconColor} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-0">
        <p
          className={cn(
            'w-24 shrink-0 truncate text-caption text-fg-subtle font-numeric max-sm:order-last max-sm:w-auto max-sm:max-w-full',
            dateClassName,
          )}
        >
          {formatDate(date, TXN_DATE_OPTIONS)}
        </p>
        <div className="flex min-w-0 max-w-full items-center gap-1.5">
          <p className={cn('truncate text-cell text-fg', labelClassName)}>{label}</p>
          {badge && (
            <Badge size="xs" className={badge.className}>
              {badge.text}
            </Badge>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right font-numeric">{amount}</div>
      <RowActions
        className={cn(
          'shrink-0 opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-within:opacity-100 sm:-my-px max-sm:opacity-100',
          actionsClassName,
        )}
      >
        {/* The 28px buttons may overlap the 1px row rule so the row stays 28px high. */}
        {onEdit && (
          <IconButton
            onClick={onEdit}
            icon={Edit3}
            label="Edit transaction"
            title="Edit transaction"
            size="sm"
            variant="ghost"
          />
        )}
        <IconButton
          onClick={onDelete}
          icon={Trash2}
          label="Delete transaction"
          title="Delete transaction"
          size="sm"
          variant="danger"
        />
      </RowActions>
    </div>
  );
}

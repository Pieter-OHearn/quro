import type { ReactNode } from 'react';
import { Edit3, Filter, Plus, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { ButtonProps } from '../../atoms';
import { Badge, Button, Card, IconButton } from '../../atoms';
import { PanelHeader, SegmentedControl } from '../../molecules';

export type FilterOption = {
  key: string;
  label: string;
};

export type TxnHistoryStat = {
  label: string;
  value: string;
  color?: string;
};

const PANEL_VARIANTS = {
  embedded: {
    bodyClassName: 'border-t border-slate-100 bg-slate-50/60 p-4',
    statsClassName: 'mb-4',
    statClassName: 'bg-white rounded-xl px-3 py-2.5 border border-slate-100',
    filterBarClassName: 'mb-3',
    listClassName: 'space-y-1.5',
    emptyStateClassName: 'py-5',
    addButtonSize: 'sm',
  },
  card: {
    bodyClassName: '',
    statsClassName: 'px-5 py-5 border-b border-slate-50',
    statClassName: 'bg-slate-50 rounded-xl px-3 py-2.5',
    filterBarClassName: 'px-5 py-3 border-b border-slate-50',
    listClassName: 'divide-y divide-slate-50',
    emptyStateClassName: 'py-10',
    addButtonSize: 'md',
  },
} as const;

const GRID_COLUMN_CLASSES = {
  '1': 'grid-cols-1',
  '2': 'grid-cols-2',
  '3': 'grid-cols-3',
  '4': 'grid-cols-4',
  '5': 'grid-cols-5',
} as const;

const DEFAULT_GRID_COLUMN_CLASS = 'grid-cols-6';

export type TxnHistoryPanelProps = {
  filterOptions: FilterOption[];
  filter: string;
  onFilterChange: (key: string) => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  stats?: TxnHistoryStat[];
  statsColumns?: number;
  onAdd: () => void;
  addLabel?: string;
  accentColor?: string;
  variant?: keyof typeof PANEL_VARIANTS;
  addButtonPlacement?: 'filterBar' | 'header';
  addButtonSize?: ButtonProps['size'];
  emptyMessage?: string;
  children: ReactNode;
  footer?: ReactNode;
  isEmpty: boolean;
};

type StatsGridProps = {
  stats: TxnHistoryStat[];
  statsColumns?: number;
  className?: string;
  statClassName?: string;
};

function StatsGrid({ stats, statsColumns, className, statClassName }: StatsGridProps) {
  const columns = statsColumns ?? stats.length;
  const columnsClass =
    GRID_COLUMN_CLASSES[String(columns) as keyof typeof GRID_COLUMN_CLASSES] ??
    DEFAULT_GRID_COLUMN_CLASS;

  return (
    <div className={cn('grid gap-3', columnsClass, className)}>
      {stats.map(({ label, value, color }) => (
        <div key={label} className={cn('rounded-xl px-3 py-2.5', statClassName)}>
          <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
          <p className={cn('text-sm font-semibold', color ?? 'text-slate-800')}>{value}</p>
        </div>
      ))}
    </div>
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
  return (
    <div className={cn('flex items-center justify-between flex-wrap gap-2', className)}>
      <div className="flex items-center gap-1">
        <Filter size={12} className="text-slate-400" />
        <span className="text-xs text-slate-400 mr-1">Filter:</span>
        <SegmentedControl
          options={filterOptions.map((option) => ({
            value: option.key,
            label: option.label,
          }))}
          value={filter}
          onChange={onFilterChange}
          variant="soft"
        />
      </div>
      {addAction}
    </div>
  );
}

type AddButtonProps = Pick<
  TxnHistoryPanelProps,
  'onAdd' | 'addLabel' | 'accentColor' | 'addButtonSize'
> & {
  fallbackSize: ButtonProps['size'];
};

function AddTransactionButton({
  onAdd,
  addLabel = 'Add Transaction',
  accentColor = 'bg-indigo-600 hover:bg-indigo-700',
  addButtonSize,
  fallbackSize,
}: AddButtonProps) {
  const resolvedAddButtonSize = addButtonSize ?? fallbackSize;
  const addButtonIconSize = resolvedAddButtonSize === 'sm' ? 12 : 14;

  return (
    <Button
      onClick={onAdd}
      variant="primary"
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
  variantStyles,
  addAction,
}: TxnHistoryBodyProps) {
  const resolvedStats = stats && stats.length > 0 ? stats : undefined;
  const content = isEmpty ? (
    <p className={cn('text-center text-slate-400 text-sm', variantStyles.emptyStateClassName)}>
      {emptyMessage}{' '}
      <button onClick={onAdd} className="text-indigo-500 hover:underline">
        Add one
      </button>
    </p>
  ) : (
    <>
      <div className={variantStyles.listClassName}>{children}</div>
      {footer}
    </>
  );

  return (
    <div className={variantStyles.bodyClassName}>
      {resolvedStats && (
        <StatsGrid
          stats={resolvedStats}
          statsColumns={statsColumns}
          className={variantStyles.statsClassName}
          statClassName={variantStyles.statClassName}
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
  addLabel = 'Add Transaction',
  accentColor = 'bg-indigo-600 hover:bg-indigo-700',
  variant = 'embedded',
  addButtonPlacement = 'filterBar',
  addButtonSize,
  emptyMessage = 'No transactions.',
  children,
  footer,
  isEmpty,
}: TxnHistoryPanelProps) {
  const variantStyles = PANEL_VARIANTS[variant];
  const addButton = (
    <AddTransactionButton
      onAdd={onAdd}
      addLabel={addLabel}
      accentColor={accentColor}
      addButtonSize={addButtonSize}
      fallbackSize={variantStyles.addButtonSize}
    />
  );
  const filterBarAction = addButtonPlacement === 'filterBar' ? addButton : undefined;
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
  iconBg: string;
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

export function TxnRow({
  icon: Icon,
  iconColor,
  iconBg,
  iconContainerClassName,
  iconSize = 13,
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
        'flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 group border border-transparent hover:border-slate-100 transition-all',
        className,
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          iconBg,
          iconContainerClassName,
        )}
      >
        <Icon size={iconSize} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn('text-xs font-medium text-slate-700', labelClassName)}>{label}</p>
          {badge && (
            <Badge size="xs" className={badge.className}>
              {badge.text}
            </Badge>
          )}
        </div>
        <p className={cn('text-[10px] text-slate-400', dateClassName)}>{formatDate(date)}</p>
      </div>
      {amount}
      <div
        className={cn(
          'flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0',
          actionsClassName,
        )}
      >
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
      </div>
    </div>
  );
}

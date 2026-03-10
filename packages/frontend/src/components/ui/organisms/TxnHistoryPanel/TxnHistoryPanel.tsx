import { Edit3, Filter, Plus, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Badge, Button, IconButton } from '../../atoms';

export type FilterOption = {
  key: string;
  label: string;
};

export type TxnHistoryStat = {
  label: string;
  value: string;
  color?: string;
};

export type TxnHistoryPanelProps = {
  filterOptions: FilterOption[];
  filter: string;
  onFilterChange: (key: string) => void;
  stats?: TxnHistoryStat[];
  statsColumns?: number;
  onAdd: () => void;
  addLabel?: string;
  accentColor?: string;
  emptyMessage?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  isEmpty: boolean;
};

type StatsGridProps = {
  stats: TxnHistoryStat[];
  statsColumns?: number;
};

function StatsGrid({ stats, statsColumns }: StatsGridProps) {
  const columns = statsColumns ?? stats.length;
  const columnsClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-2'
        : columns === 3
          ? 'grid-cols-3'
          : columns === 4
            ? 'grid-cols-4'
            : columns === 5
              ? 'grid-cols-5'
              : 'grid-cols-6';

  return (
    <div className={cn('grid gap-3 mb-4', columnsClass)}>
      {stats.map(({ label, value, color }) => (
        <div key={label} className="bg-white rounded-xl px-3 py-2.5 border border-slate-100">
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
  onAdd: () => void;
  addLabel: string;
  accentColor: string;
};

function FilterBar({
  filterOptions,
  filter,
  onFilterChange,
  onAdd,
  addLabel,
  accentColor,
}: FilterBarProps) {
  return (
    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
      <div className="flex items-center gap-1">
        <Filter size={12} className="text-slate-400" />
        <span className="text-xs text-slate-400 mr-1">Filter:</span>
        {filterOptions.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={cn(
              'text-xs px-2.5 py-1 rounded-lg transition-colors',
              filter === f.key
                ? 'bg-indigo-100 text-indigo-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Button
        onClick={onAdd}
        variant="primary"
        size="sm"
        leadingIcon={<Plus size={12} />}
        className={accentColor}
      >
        {addLabel}
      </Button>
    </div>
  );
}

export function TxnHistoryPanel({
  filterOptions,
  filter,
  onFilterChange,
  stats,
  statsColumns,
  onAdd,
  addLabel = 'Add Transaction',
  accentColor = 'bg-indigo-600 hover:bg-indigo-700',
  emptyMessage = 'No transactions.',
  children,
  footer,
  isEmpty,
}: TxnHistoryPanelProps) {
  return (
    <div className="border-t border-slate-100 bg-slate-50/60 p-4">
      {stats && stats.length > 0 && <StatsGrid stats={stats} statsColumns={statsColumns} />}
      <FilterBar
        filterOptions={filterOptions}
        filter={filter}
        onFilterChange={onFilterChange}
        onAdd={onAdd}
        addLabel={addLabel}
        accentColor={accentColor}
      />
      {isEmpty ? (
        <p className="text-center py-5 text-slate-400 text-sm">
          {emptyMessage}{' '}
          <button onClick={onAdd} className="text-indigo-500 hover:underline">
            Add one
          </button>
        </p>
      ) : (
        <>
          <div className="space-y-1.5">{children}</div>
          {footer}
        </>
      )}
    </div>
  );
}

export type TxnRowProps = {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  label: string;
  date: string;
  badge?: { text: string; className: string };
  amount: React.ReactNode;
  onEdit?: () => void;
  onDelete: () => void;
};

export function TxnRow({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  date,
  badge,
  amount,
  onEdit,
  onDelete,
}: TxnRowProps) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 group border border-transparent hover:border-slate-100 transition-all">
      <div
        className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}
      >
        <Icon size={13} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-slate-700">{label}</p>
          {badge && (
            <Badge size="xs" className={badge.className}>
              {badge.text}
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-slate-400">{formatDate(date)}</p>
      </div>
      {amount}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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

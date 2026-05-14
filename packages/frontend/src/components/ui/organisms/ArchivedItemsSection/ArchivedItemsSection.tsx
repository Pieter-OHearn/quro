import { useState, type ReactNode } from 'react';
import { Archive, ChevronDown, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { ArchiveOrDeleteDialog } from '../ArchiveOrDeleteDialog';

export type ArchivedItem = {
  id: number;
  name: string;
  archivedAt?: Date | string | null;
};

export type ArchivedItemBalance = {
  value: number;
  currency: string;
  label?: string;
};

export type ArchivedItemsSectionProps<T extends ArchivedItem> = {
  title: string;
  entityLabel: string;
  childrenLabel: string;
  items: readonly T[];
  renderMeta?: (item: T) => ReactNode;
  getBalance?: (item: T) => ArchivedItemBalance | null;
  onUnarchive: (item: T) => void;
  onHardDelete: (item: T) => void;
};

function formatArchivedAt(archivedAt: Date | string | null | undefined): string | null {
  if (!archivedAt) return null;
  const date = archivedAt instanceof Date ? archivedAt : new Date(archivedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ArchivedRow<T extends ArchivedItem>({
  item,
  renderMeta,
  onUnarchive,
  onRequestDelete,
}: Readonly<{
  item: T;
  renderMeta?: (item: T) => ReactNode;
  onUnarchive: (item: T) => void;
  onRequestDelete: (item: T) => void;
}>) {
  const archivedLabel = formatArchivedAt(item.archivedAt);
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{item.name}</p>
        <p className="text-xs text-slate-400">
          {archivedLabel ? `Archived ${archivedLabel}` : 'Archived'}
          {renderMeta ? <> · {renderMeta(item)}</> : null}
        </p>
      </div>
      <button
        onClick={() => onUnarchive(item)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs transition-colors"
        title="Restore"
      >
        <RotateCcw size={12} /> Restore
      </button>
      <button
        onClick={() => onRequestDelete(item)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 text-xs transition-colors"
        title="Delete permanently"
      >
        <Trash2 size={12} /> Delete
      </button>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: Readonly<{ title: string; count: number; expanded: boolean; onToggle: () => void }>) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50/80 transition-colors"
    >
      <Archive size={14} className="text-slate-400" />
      <span className="text-sm font-medium text-slate-600">{title}</span>
      <span className="text-xs text-slate-400">
        {count} item{count === 1 ? '' : 's'}
      </span>
      <Chevron size={16} className="ml-auto text-slate-400" />
    </button>
  );
}

export function ArchivedItemsSection<T extends ArchivedItem>({
  title,
  entityLabel,
  childrenLabel,
  items,
  renderMeta,
  getBalance,
  onUnarchive,
  onHardDelete,
}: Readonly<ArchivedItemsSectionProps<T>>) {
  const [expanded, setExpanded] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);

  if (items.length === 0) return null;

  const balance = pendingDelete && getBalance ? getBalance(pendingDelete) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <SectionHeader
        title={title}
        count={items.length}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
      {expanded ? (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {items.map((item) => (
            <ArchivedRow
              key={item.id}
              item={item}
              renderMeta={renderMeta}
              onUnarchive={onUnarchive}
              onRequestDelete={setPendingDelete}
            />
          ))}
        </div>
      ) : null}
      {pendingDelete ? (
        <ArchiveOrDeleteDialog
          entityLabel={entityLabel}
          entityName={pendingDelete.name}
          balance={balance?.value ?? null}
          balanceCurrency={balance?.currency}
          balanceLabel={balance?.label}
          childrenLabel={childrenLabel}
          hideArchive
          onDelete={() => {
            onHardDelete(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}

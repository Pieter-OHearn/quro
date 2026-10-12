import { useState, type ReactNode } from 'react';
import { Archive, ChevronDown, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
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
    <div className="flex min-h-9 items-center gap-2 px-3 py-px transition-colors duration-fast hover:bg-surface-muted max-sm:min-h-12 max-sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-cell font-medium text-fg">{item.name}</p>
        <p className="text-caption text-fg-subtle">
          {archivedLabel ? `Archived ${archivedLabel}` : 'Archived'}
          {renderMeta ? <> · {renderMeta(item)}</> : null}
        </p>
      </div>
      <Button
        onClick={() => onUnarchive(item)}
        variant="secondary"
        size="sm"
        leadingIcon={<RotateCcw size={12} aria-hidden />}
        title="Restore"
      >
        Restore
      </Button>
      <Button
        onClick={() => onRequestDelete(item)}
        variant="danger"
        size="sm"
        leadingIcon={<Trash2 size={12} aria-hidden />}
        title="Delete permanently"
      >
        Delete
      </Button>
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
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex h-9 w-full items-center gap-2 px-3 text-left transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring max-sm:h-11 max-sm:px-4"
    >
      <Archive size={14} className="text-fg-faint" aria-hidden />
      <span className="text-cell font-medium text-fg">{title}</span>
      <span className="text-caption text-fg-subtle font-numeric">
        {count} item{count === 1 ? '' : 's'}
      </span>
      <Chevron size={16} className="ml-auto text-fg-faint" aria-hidden />
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
    <Card padding="none" className="overflow-hidden">
      <SectionHeader
        title={title}
        count={items.length}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
      {expanded ? (
        <div className="divide-y divide-border-subtle border-t border-border-default">
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
    </Card>
  );
}

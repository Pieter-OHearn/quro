import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TxnTypeMeta = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  /** Unused since the selector shows selection as a `brand-soft` tint; optional for callers. */
  bg?: string;
  borderColor?: string;
};

export type TxnTypeSelectorProps<T extends string> = {
  types: TxnTypeMeta[];
  value: T;
  onChange: (type: T) => void;
  columns?: 2 | 3 | 4;
};

// 32px options with the icon beside the label; on phones 44px with the icon above it. The
// selected option is a `brand-soft` tint with a `brand` edge, like every selection; only its
// icon keeps the type colour from `color`.
export function TxnTypeSelector<T extends string>({
  types,
  value,
  onChange,
  columns = 3,
}: TxnTypeSelectorProps<T>) {
  return (
    <div
      className={cn(
        'grid gap-2',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        columns === 4 && 'grid-cols-4',
      )}
    >
      {types.map((t) => {
        const Icon = t.icon;
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.key as T)}
            className={cn(
              'flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-label transition-colors duration-fast max-sm:h-11 max-sm:flex-col max-sm:gap-0.5',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
              active
                ? 'border-brand bg-brand-soft font-semibold text-brand-fg'
                : 'border-border-control bg-surface text-fg-muted hover:bg-surface-muted active:bg-surface-muted',
            )}
          >
            <Icon size={14} aria-hidden="true" className={cn('shrink-0', active && t.color)} />
            <span className="max-w-full min-w-0 truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

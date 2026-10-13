import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The calculated result under a form, such as a balance after a transaction: a bordered box of
 * label and figure rows. Colour belongs to the figures (`Change`, `TxnAmount`), not the box.
 */
export function PreviewPanel({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn('space-y-1 rounded-lg border border-border-default px-3 py-2', className)}>
      {children}
    </div>
  );
}

/** One label and figure line in a `PreviewPanel`; `total` puts a rule above it. */
export function PreviewRow({
  label,
  children,
  total = false,
}: Readonly<{ label: ReactNode; children: ReactNode; total?: boolean }>) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 text-cell',
        total && 'mt-1 border-t border-border-subtle pt-1 font-medium',
      )}
    >
      <span className="text-fg-muted">{label}</span>
      <span className="text-right font-numeric text-fg">{children}</span>
    </div>
  );
}

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/** A danger badge for the error screens: a `danger` edge on `danger-soft`, 11px like every badge. */
export function ErrorBadge({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-danger bg-danger-soft px-1.5 py-px text-[11px] leading-4 font-medium text-danger">
      <AlertTriangle size={12} aria-hidden="true" />
      {children}
    </span>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The import dialog's body padding: 16px, like every dialog. */
export function ImportBody({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={cn('space-y-4 p-4', className)}>{children}</div>;
}

/** Footer actions like the shared dialog footer: at the end, sharing one 44px row on phones. */
export function ImportFooter({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex shrink-0 justify-end gap-2 border-t border-border-default bg-surface-sunken px-4 py-3 max-sm:flex-wrap max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:*:h-11 max-sm:*:min-w-[calc(50%-0.25rem)] max-sm:*:flex-1">
      {children}
    </div>
  );
}

const NOTICE_TONES = {
  danger: 'border-danger bg-danger-soft text-danger',
  info: 'border-info bg-info-soft text-info',
  success: 'border-success bg-success-soft text-success',
  neutral: 'border-border-default text-fg-muted',
} as const;

/** A bordered notice in a status tone; errors are announced. */
export function ImportNotice({
  tone,
  children,
  className,
}: Readonly<{ tone: keyof typeof NOTICE_TONES; children: ReactNode; className?: string }>) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn('rounded-md border px-3 py-2 text-cell', NOTICE_TONES[tone], className)}
    >
      {children}
    </div>
  );
}

import type { ReactNode } from 'react';
import { AlertTriangle, CircleAlert, Info, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../atoms';

// A notice about the state of the data behind a figure: an estimate, a stale input, a record
// that needs review (`warning`), data that could not be loaded (`danger`) or where a value came
// from (`info`). It sits above the figures it qualifies and never replaces them.
const TONES = {
  warning: {
    icon: AlertTriangle,
    box: 'border-warning bg-warning-soft',
    text: 'text-warning',
    role: 'status',
  },
  danger: {
    icon: CircleAlert,
    box: 'border-danger bg-danger-soft',
    text: 'text-danger',
    role: 'alert',
  },
  info: {
    icon: Info,
    box: 'border-info bg-info-soft',
    text: 'text-info',
    role: 'status',
  },
} as const satisfies Record<string, { icon: LucideIcon; box: string; text: string; role: string }>;

const ICON_SIZE = 16;

export type StateNoticeProps = {
  tone?: keyof typeof TONES;
  /** One short line that says what is wrong with the data. */
  title: string;
  /** What it means for the figures and what to do about it. */
  children?: ReactNode;
  action?: { label: string; onClick: () => void; loading?: boolean };
  className?: string;
  testId?: string;
};

export function StateNotice({
  tone = 'warning',
  title,
  children,
  action,
  className,
  testId,
}: Readonly<StateNoticeProps>) {
  const { icon: Icon, box, text, role } = TONES[tone];
  return (
    <div
      role={role}
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2 max-sm:rounded-xl max-sm:px-4 max-sm:py-3',
        box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <Icon size={ICON_SIZE} className={cn('mt-0.5 shrink-0', text)} aria-hidden />
        <div className="min-w-0">
          <p className={cn('text-cell font-medium', text)}>{title}</p>
          {children ? <div className="mt-0.5 text-cell text-fg-muted">{children}</div> : null}
        </div>
      </div>
      {action ? (
        <Button
          variant="secondary"
          size="sm"
          loading={action.loading}
          onClick={action.onClick}
          className="max-sm:w-full"
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

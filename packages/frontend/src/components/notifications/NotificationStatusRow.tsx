import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { NotificationStatusCounts } from './types';

type NotificationStatusRowProps = {
  counts: NotificationStatusCounts;
};

const STATUS_META: Array<{
  key: keyof NotificationStatusCounts;
  label: string;
  dotClass: string;
}> = [
  { key: 'queuing', label: 'Queuing', dotClass: 'bg-border-strong' },
  { key: 'processing', label: 'Processing', dotClass: 'bg-brand' },
  { key: 'ready', label: 'Ready', dotClass: 'bg-warning' },
  { key: 'failed', label: 'Failed', dotClass: 'bg-danger' },
  { key: 'reminder', label: 'Reminders', dotClass: 'bg-warning' },
];

export function NotificationStatusRow({ counts }: Readonly<NotificationStatusRowProps>) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto border-b border-border-default bg-surface-sunken px-3 py-1.5">
      {STATUS_META.map((statusMeta) => {
        const count = counts[statusMeta.key];
        return (
          <div key={statusMeta.key} className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn('h-2 w-2 flex-shrink-0 rounded-full', statusMeta.dotClass)}
              aria-hidden="true"
            />
            <span className="text-caption text-fg-muted">{statusMeta.label}</span>
            {count > 0 && (
              <Badge size="xs" className="font-numeric">
                {count}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

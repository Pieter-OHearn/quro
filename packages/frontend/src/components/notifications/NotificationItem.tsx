import type { MouseEvent } from 'react';
import { AlertCircle, ArrowRight, Clock, Home, Loader2, X } from 'lucide-react';
import { Badge, IconButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { toRelativeTime } from './notification-utils';
import type { NotificationItem as NotificationItemType } from './types';

// Each status shows as an icon colour; a waiting or running job also gets a badge, and the
// action of a finished one reads as a link.
const ICON_COLORS = {
  queuing: 'text-fg-subtle',
  processing: 'text-brand',
  ready: 'text-warning',
  failed: 'text-danger',
  reminder: 'text-warning',
} as const;

const ACTION_CLASS_NAME = 'inline-flex items-center gap-1 text-label';

type NotificationItemProps = {
  item: NotificationItemType;
  onAction: (item: NotificationItemType) => void;
  onDismiss: (item: NotificationItemType) => void;
};

function renderStatusIcon(item: NotificationItemType) {
  const iconColor = ICON_COLORS[item.status];
  if (item.kind === 'mortgage_expiry')
    return <Home size={16} className={iconColor} aria-hidden="true" />;
  if (item.status === 'queuing')
    return <Clock size={16} className={iconColor} aria-hidden="true" />;
  if (item.status === 'processing')
    return <Loader2 size={16} className={cn(iconColor, 'animate-spin')} aria-hidden="true" />;
  if (item.status === 'failed')
    return <AlertCircle size={16} className={iconColor} aria-hidden="true" />;
  return <span className="text-body leading-none">{item.potEmoji}</span>;
}

function renderFooter(item: NotificationItemType) {
  if (item.status === 'queuing') {
    return <Badge>In queue</Badge>;
  }

  if (item.status === 'processing') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Badge tone="brand">Processing</Badge>
          <span className="text-caption text-fg-subtle">AI reading your PDF…</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand motion-safe:animate-pulse"
            style={{ width: '62%' }}
          />
        </div>
      </div>
    );
  }

  if (item.status === 'failed') {
    return (
      <span className={cn(ACTION_CLASS_NAME, 'text-danger')}>
        View error
        <ArrowRight size={12} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={cn(ACTION_CLASS_NAME, 'text-brand')}>
      {item.status === 'reminder' ? 'Review mortgage' : 'Review now'}
      <ArrowRight size={12} aria-hidden="true" />
    </span>
  );
}

export function NotificationItem({ item, onAction, onDismiss }: Readonly<NotificationItemProps>) {
  const handleClick = (event: MouseEvent<HTMLLIElement>): void => {
    event.preventDefault();
    if (!item.actionable) return;
    onAction(item);
  };

  return (
    <li
      onClick={handleClick}
      className={cn(
        'flex items-start gap-2 px-3 py-2 transition-colors duration-fast select-none',
        item.actionable
          ? 'cursor-pointer hover:bg-surface-muted active:bg-surface-muted'
          : 'cursor-default',
      )}
    >
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
        {renderStatusIcon(item)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-cell font-medium text-fg">{item.title}</p>
          <div className="flex flex-shrink-0 items-center gap-1">
            <span className="whitespace-nowrap font-numeric text-caption text-fg-subtle">
              {item.timeLabel ?? toRelativeTime(item.updatedAt)}
            </span>
            {item.dismissible && (
              <IconButton
                icon={X}
                label="Dismiss notification"
                size="sm"
                className="-my-1"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss(item);
                }}
              />
            )}
          </div>
        </div>

        <p className="mb-1.5 truncate text-caption text-fg-muted">{item.body}</p>
        {renderFooter(item)}
      </div>
    </li>
  );
}

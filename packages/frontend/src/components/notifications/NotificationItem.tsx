import type { MouseEvent } from 'react';
import { AlertCircle, ArrowRight, Clock, Home, Loader2, Sparkles, X } from 'lucide-react';
import { toRelativeTime } from './notification-utils';
import type { NotificationItem as NotificationItemType } from './types';

const STATUS_META = {
  queuing: {
    bar: 'bg-border-strong',
    bgTint: '',
    iconBg: 'bg-surface-muted',
    iconColor: 'text-fg-faint',
    label: 'In queue',
    labelCls: 'bg-surface-muted text-fg-subtle',
  },
  processing: {
    bar: 'bg-brand-disabled',
    bgTint: 'bg-brand-soft/30',
    iconBg: 'bg-brand-soft',
    iconColor: 'text-brand-accent',
    label: 'Processing',
    labelCls: 'bg-brand-soft text-brand border border-brand-soft-strong',
  },
  ready: {
    bar: 'bg-warning-muted',
    bgTint: 'bg-warning-soft/20',
    iconBg: 'bg-warning-soft',
    iconColor: 'text-warning',
    label: 'Ready',
    labelCls: 'bg-success-soft text-success border border-success-soft-strong',
  },
  failed: {
    bar: 'bg-danger-muted',
    bgTint: 'bg-danger-soft/30',
    iconBg: 'bg-danger-soft',
    iconColor: 'text-danger-hover',
    label: 'Failed',
    labelCls: 'bg-danger-soft text-danger-hover border border-danger-soft-strong',
  },
  reminder: {
    bar: 'bg-warning-muted',
    bgTint: 'bg-warning-soft/20',
    iconBg: 'bg-warning-soft',
    iconColor: 'text-warning',
    label: 'Reminder',
    labelCls: 'bg-warning-soft text-warning-fg border border-warning-soft-strong',
  },
} as const;

type NotificationItemProps = {
  item: NotificationItemType;
  onAction: (item: NotificationItemType) => void;
  onDismiss: (item: NotificationItemType) => void;
};

function renderStatusIcon(item: NotificationItemType) {
  const meta = STATUS_META[item.status];
  if (item.kind === 'mortgage_expiry') return <Home size={16} className={meta.iconColor} />;
  if (item.status === 'queuing') return <Clock size={16} className={meta.iconColor} />;
  if (item.status === 'processing')
    return <Loader2 size={16} className={`${meta.iconColor} animate-spin`} />;
  if (item.status === 'failed') return <AlertCircle size={16} className={meta.iconColor} />;
  return <span className="text-sm leading-none">{item.potEmoji}</span>;
}

function renderFooter(item: NotificationItemType) {
  const meta = STATUS_META[item.status];

  if (item.status === 'queuing') {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.labelCls}`}>
          {meta.label}
        </span>
        <div className="flex items-center gap-0.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-1 h-1 rounded-full bg-fg-faint animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (item.status === 'processing') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${meta.labelCls}`}
          >
            <Loader2 size={8} className="animate-spin" />
            {meta.label}
          </span>
          <span className="text-[10px] text-fg-faint">AI reading your PDF…</span>
        </div>
        <div className="h-1 bg-surface-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-disabled rounded-full animate-pulse"
            style={{ width: '62%' }}
          />
        </div>
      </div>
    );
  }

  if (item.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] bg-danger-hover text-fg-inverted px-2.5 py-1 rounded-full font-medium">
        <AlertCircle size={9} />
        View error
        <ArrowRight size={9} />
      </span>
    );
  }

  if (item.status === 'reminder') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] bg-warning text-fg-inverted px-2.5 py-1 rounded-full font-medium">
        Review mortgage
        <ArrowRight size={9} />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] bg-brand text-fg-inverted px-2.5 py-1 rounded-full font-medium">
      <Sparkles size={9} />
      Review now
      <ArrowRight size={9} />
    </span>
  );
}

export function NotificationItem({ item, onAction, onDismiss }: Readonly<NotificationItemProps>) {
  const meta = STATUS_META[item.status];

  const handleClick = (event: MouseEvent<HTMLLIElement>): void => {
    event.preventDefault();
    if (!item.actionable) return;
    onAction(item);
  };

  return (
    <li
      onClick={handleClick}
      className={`relative flex items-start gap-3 px-4 py-3.5 transition-colors select-none ${
        item.actionable ? 'cursor-pointer' : 'cursor-default'
      } ${meta.bgTint || 'hover:bg-surface-sunken/60'}`}
    >
      <div
        className={`absolute left-0 inset-y-0 w-[3px] rounded-r-full ${meta.bar} ${
          item.status === 'processing' ? 'animate-pulse' : ''
        }`}
      />

      <div
        className={`w-9 h-9 rounded-xl ${meta.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5 border border-fg-inverted/60`}
      >
        {renderStatusIcon(item)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className="text-xs leading-snug font-semibold text-fg-emphasis">{item.title}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[10px] text-fg-faint mt-px tabular-nums whitespace-nowrap">
              {item.timeLabel ?? toRelativeTime(item.updatedAt)}
            </span>
            {item.dismissible && (
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss(item);
                }}
                className="p-0.5 rounded text-fg-faint hover:text-fg-strong hover:bg-surface-muted"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-fg-subtle leading-relaxed truncate mb-2">{item.body}</p>
        {renderFooter(item)}
      </div>
    </li>
  );
}

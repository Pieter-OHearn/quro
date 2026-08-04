import type { MouseEvent } from 'react';
import { AlertCircle, ArrowRight, Clock, Home, Loader2, Sparkles, X } from 'lucide-react';
import { toRelativeTime } from './notification-utils';
import type { NotificationItem as NotificationItemType } from './types';

const STATUS_META = {
  queuing: {
    bar: 'bg-slate-300',
    bgTint: '',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-400',
    label: 'In queue',
    labelCls: 'bg-slate-100 text-slate-500',
  },
  processing: {
    bar: 'bg-indigo-400',
    bgTint: 'bg-indigo-50/30',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
    label: 'Processing',
    labelCls: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
  },
  ready: {
    bar: 'bg-amber-400',
    bgTint: 'bg-amber-50/20',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    label: 'Ready',
    labelCls: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  },
  failed: {
    bar: 'bg-rose-400',
    bgTint: 'bg-rose-50/30',
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    label: 'Failed',
    labelCls: 'bg-rose-50 text-rose-600 border border-rose-100',
  },
  reminder: {
    bar: 'bg-amber-400',
    bgTint: 'bg-amber-50/20',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    label: 'Reminder',
    labelCls: 'bg-amber-50 text-amber-700 border border-amber-100',
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
              className="w-1 h-1 rounded-full bg-slate-400 animate-bounce"
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
          <span className="text-[10px] text-slate-400">AI reading your PDF…</span>
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-400 rounded-full animate-pulse"
            style={{ width: '62%' }}
          />
        </div>
      </div>
    );
  }

  if (item.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] bg-rose-600 text-white px-2.5 py-1 rounded-full font-medium">
        <AlertCircle size={9} />
        View error
        <ArrowRight size={9} />
      </span>
    );
  }

  if (item.status === 'reminder') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] bg-amber-600 text-white px-2.5 py-1 rounded-full font-medium">
        Review mortgage
        <ArrowRight size={9} />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] bg-indigo-600 text-white px-2.5 py-1 rounded-full font-medium">
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
      } ${meta.bgTint || 'hover:bg-slate-50/60'}`}
    >
      <div
        className={`absolute left-0 inset-y-0 w-[3px] rounded-r-full ${meta.bar} ${
          item.status === 'processing' ? 'animate-pulse' : ''
        }`}
      />

      <div
        className={`w-9 h-9 rounded-xl ${meta.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5 border border-white/60`}
      >
        {renderStatusIcon(item)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className="text-xs leading-snug font-semibold text-slate-800">{item.title}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[10px] text-slate-400 mt-px tabular-nums whitespace-nowrap">
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
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed truncate mb-2">{item.body}</p>
        {renderFooter(item)}
      </div>
    </li>
  );
}

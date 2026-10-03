import { Bell, Loader2 } from 'lucide-react';

type NotificationPanelHeaderProps = {
  totalCount: number;
  isFetching: boolean;
};

export function NotificationPanelHeader({
  totalCount,
  isFetching,
}: Readonly<NotificationPanelHeaderProps>) {
  return (
    <div className="bg-gradient-to-r from-surface-inverse to-surface-inverse-panel px-4 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Bell size={14} className="text-warning-muted" />
        <span className="text-sm font-semibold text-fg-inverted">Notifications</span>
        {totalCount > 0 && (
          <span className="text-[10px] bg-surface/10 text-fg-disabled px-1.5 py-0.5 rounded-full tabular-nums">
            {totalCount}
          </span>
        )}
      </div>
      {isFetching && <Loader2 size={13} className="text-brand-tint animate-spin" />}
    </div>
  );
}

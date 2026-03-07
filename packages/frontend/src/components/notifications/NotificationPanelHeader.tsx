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
    <div className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-4 py-3.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Bell size={14} className="text-amber-400" />
        <span className="text-sm font-semibold text-white">Notifications</span>
        {totalCount > 0 && (
          <span className="text-[10px] bg-white/10 text-slate-300 px-1.5 py-0.5 rounded-full tabular-nums">
            {totalCount}
          </span>
        )}
      </div>
      {isFetching && <Loader2 size={13} className="text-indigo-200 animate-spin" />}
    </div>
  );
}

import { Bell } from 'lucide-react';

export function NotificationEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
        <Bell size={20} className="text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-500">All caught up!</p>
      <p className="text-xs text-slate-400 mt-1">Background jobs will appear here.</p>
    </div>
  );
}

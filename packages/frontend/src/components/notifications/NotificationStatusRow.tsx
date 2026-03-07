import type { NotificationStatusCounts } from './types';

type NotificationStatusRowProps = {
  counts: NotificationStatusCounts;
};

const STATUS_META: Array<{
  key: keyof NotificationStatusCounts;
  label: string;
  dotClass: string;
  pulse?: boolean;
}> = [
  { key: 'queuing', label: 'Queuing', dotClass: 'bg-slate-300' },
  { key: 'processing', label: 'Processing', dotClass: 'bg-indigo-400', pulse: true },
  { key: 'ready', label: 'Ready', dotClass: 'bg-amber-400' },
  { key: 'failed', label: 'Failed', dotClass: 'bg-rose-400' },
];

export function NotificationStatusRow({ counts }: Readonly<NotificationStatusRowProps>) {
  return (
    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-3 overflow-x-auto">
      {STATUS_META.map((statusMeta) => {
        const count = counts[statusMeta.key];
        return (
          <div key={statusMeta.key} className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${statusMeta.dotClass} ${statusMeta.pulse ? 'animate-pulse' : ''}`}
            />
            <span className="text-[10px] text-slate-500">{statusMeta.label}</span>
            {count > 0 && (
              <span className="text-[9px] bg-slate-200 text-slate-500 min-w-3.5 h-3.5 rounded-full px-1 inline-flex items-center justify-center font-medium">
                {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

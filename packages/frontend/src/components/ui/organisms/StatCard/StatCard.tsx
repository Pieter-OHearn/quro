import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleHelp } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

const COLOR_MAP = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  sky: 'bg-sky-50 text-sky-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-500',
} as const;

export type StatCardProps = {
  label: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  color: keyof typeof COLOR_MAP;
  change?: { value: string; positive: boolean; details?: string };
  href?: string;
  className?: string;
};

type StatCardContentProps = Omit<StatCardProps, 'className'>;

function StatCardContent({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
  change,
  href,
}: StatCardContentProps) {
  return (
    <>
      <div className="flex items-start justify-between mb-3">
        <div
          className={cn('w-10 h-10 rounded-xl flex items-center justify-center', COLOR_MAP[color])}
        >
          <Icon size={18} />
        </div>
        {href && (
          <ArrowRight
            size={14}
            className="text-slate-300 group-hover:text-slate-500 transition-colors"
          />
        )}
      </div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-bold text-slate-900">{value}</p>
      {change && (
        <div
          className={cn(
            'group/trend relative flex items-center gap-1 mt-1 text-xs',
            change.positive ? 'text-emerald-600' : 'text-rose-500',
          )}
        >
          {change.value.includes('%') &&
            (change.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}
          <span>{change.value}</span>
          {change.details && <CircleHelp size={12} className="text-slate-400" />}
          {change.details && (
            <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity group-hover/trend:opacity-100">
              {change.details}
            </span>
          )}
        </div>
      )}
      {subtitle && !change && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </>
  );
}

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  color,
  change,
  href,
  className,
}: StatCardProps) {
  const contentProps = { label, value, subtitle, icon, color, change, href };
  if (href) {
    return (
      <Link
        to={href}
        className={cn(
          'bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow group',
          className,
        )}
      >
        <StatCardContent {...contentProps} />
      </Link>
    );
  }
  return (
    <div className={cn('bg-white rounded-2xl p-5 border border-slate-100 shadow-sm', className)}>
      <StatCardContent {...contentProps} />
    </div>
  );
}

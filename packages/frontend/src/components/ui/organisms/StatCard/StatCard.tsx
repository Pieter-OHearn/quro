import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleHelp } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

const COLOR_MAP = {
  indigo: 'bg-brand-soft text-brand',
  emerald: 'bg-success-soft text-success',
  sky: 'bg-info-soft text-info',
  amber: 'bg-warning-soft text-warning',
  rose: 'bg-danger-soft text-danger',
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
  testId?: string;
  valueClassName?: string;
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
  valueClassName,
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
            className="text-fg-disabled group-hover:text-fg-subtle transition-colors"
          />
        )}
      </div>
      <p className="text-xs text-fg-subtle mb-1">{label}</p>
      <p className={cn('font-bold text-fg', valueClassName)}>{value}</p>
      {change && (
        <div
          className={cn(
            'group/trend relative flex items-center gap-1 mt-1 text-xs',
            change.positive ? 'text-success' : 'text-danger',
          )}
        >
          {change.value.includes('%') &&
            (change.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}
          <span>{change.value}</span>
          {change.details && <CircleHelp size={12} className="text-fg-faint" />}
          {change.details && (
            <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-lg border border-border-default bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-fg-muted opacity-0 shadow-popover transition-opacity group-hover/trend:opacity-100">
              {change.details}
            </span>
          )}
        </div>
      )}
      {subtitle && !change && <p className="text-xs text-fg-faint mt-1">{subtitle}</p>}
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
  testId,
  valueClassName,
}: StatCardProps) {
  const contentProps = { label, value, subtitle, icon, color, change, href, valueClassName };
  if (href) {
    return (
      <Link
        to={href}
        data-testid={testId}
        className={cn(
          'bg-surface rounded-2xl p-5 border border-border-subtle shadow-card hover:shadow-popover transition-shadow group',
          className,
        )}
      >
        <StatCardContent {...contentProps} />
      </Link>
    );
  }
  return (
    <div
      data-testid={testId}
      className={cn(
        'bg-surface rounded-2xl p-5 border border-border-subtle shadow-card',
        className,
      )}
    >
      <StatCardContent {...contentProps} />
    </div>
  );
}

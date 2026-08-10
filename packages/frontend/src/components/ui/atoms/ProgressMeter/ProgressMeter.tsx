import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ProgressMeterProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  value: number;
  max?: number;
  label?: string;
  indicatorClassName?: string;
};

export function ProgressMeter({
  value,
  max = 100,
  label,
  className,
  indicatorClassName,
  ...props
}: ProgressMeterProps) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      className={cn('h-2 overflow-hidden rounded-full bg-surface-muted', className)}
      {...props}
    >
      <div
        className={cn('h-full rounded-full bg-brand transition-[width]', indicatorClassName)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

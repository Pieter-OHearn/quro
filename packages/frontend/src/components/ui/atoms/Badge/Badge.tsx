import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-[11px]',
} as const;

const TONE_CLASSES = {
  brand: 'bg-brand-soft-strong text-brand-fg',
  info: 'bg-info-soft-strong text-info-fg',
  neutral: 'bg-surface-muted text-fg-muted',
  muted: 'bg-surface-muted text-fg-subtle',
  success: 'bg-success-soft-strong text-success-fg',
  warning: 'bg-warning-soft-strong text-warning-fg',
  warningSoft: 'bg-warning-soft text-warning-fg',
} as const;

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  size?: keyof typeof SIZE_CLASSES;
  tone?: keyof typeof TONE_CLASSES;
};

export function Badge({
  children,
  className,
  size = 'sm',
  tone = 'neutral',
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

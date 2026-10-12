import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  xs: 'px-1 py-px',
  sm: 'px-1.5 py-px',
  md: 'px-2 py-0.5',
} as const;

// Each tone is a 1px coloured edge on a soft fill; neutral and muted sit on the card itself.
const NEUTRAL_TONE = 'border-border-default text-fg-muted';
const WARNING_TONE = 'border-warning bg-warning-soft text-warning';

const TONE_CLASSES = {
  brand: 'border-brand bg-brand-soft text-brand-fg',
  info: 'border-info bg-info-soft text-info',
  neutral: NEUTRAL_TONE,
  muted: NEUTRAL_TONE,
  success: 'border-success bg-success-soft text-success',
  warning: WARNING_TONE,
  warningSoft: WARNING_TONE,
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
        'inline-flex items-center gap-1 rounded-sm border text-[11px] leading-4 font-medium',
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

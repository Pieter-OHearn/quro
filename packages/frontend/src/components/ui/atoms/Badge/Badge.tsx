import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-[11px]',
} as const;

const TONE_CLASSES = {
  brand: 'bg-indigo-100 text-indigo-700',
  info: 'bg-sky-100 text-sky-700',
  neutral: 'bg-slate-100 text-slate-600',
  muted: 'bg-slate-100 text-slate-500',
  success: 'bg-emerald-100 text-emerald-600',
  warning: 'bg-amber-100 text-amber-700',
  warningSoft: 'bg-amber-50 text-amber-700',
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

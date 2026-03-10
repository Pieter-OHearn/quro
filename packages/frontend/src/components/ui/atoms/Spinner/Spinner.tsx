import { Loader2 } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
} as const;

const TONE_CLASSES = {
  brand: 'text-indigo-500',
  current: 'text-current',
  inverse: 'text-white',
  muted: 'text-slate-400',
} as const;

export type SpinnerProps = Omit<ComponentPropsWithoutRef<typeof Loader2>, 'size'> & {
  size?: keyof typeof SIZE_CLASSES;
  tone?: keyof typeof TONE_CLASSES;
};

export function Spinner({ className, size = 'md', tone = 'current', ...props }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin', SIZE_CLASSES[size], TONE_CLASSES[tone], className)}
      {...props}
    />
  );
}

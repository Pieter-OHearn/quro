import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const PADDING_CLASSES = {
  none: '',
  md: 'p-6',
} as const;

export type CardProps = ComponentPropsWithoutRef<'div'> & {
  padding?: keyof typeof PADDING_CLASSES;
};

export function Card({ className, padding = 'md', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border border-slate-100 shadow-sm',
        PADDING_CLASSES[padding],
        className,
      )}
      {...props}
    />
  );
}

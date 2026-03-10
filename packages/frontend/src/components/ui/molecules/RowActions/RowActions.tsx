import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const ALIGNMENT_CLASSES = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
} as const;

const GAP_CLASSES = {
  sm: 'gap-1',
  md: 'gap-1.5',
} as const;

export type RowActionsProps = ComponentPropsWithoutRef<'div'> & {
  align?: keyof typeof ALIGNMENT_CLASSES;
  gap?: keyof typeof GAP_CLASSES;
};

export function RowActions({ align = 'end', gap = 'sm', className, ...props }: RowActionsProps) {
  return (
    <div
      className={cn('flex items-center', ALIGNMENT_CLASSES[align], GAP_CLASSES[gap], className)}
      {...props}
    />
  );
}

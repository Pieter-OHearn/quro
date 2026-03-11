import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

export type StatsGridProps = ComponentPropsWithoutRef<'div'>;

export function StatsGrid({ className, ...props }: StatsGridProps) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5', className)}
      {...props}
    />
  );
}

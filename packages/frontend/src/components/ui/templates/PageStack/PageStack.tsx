import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const GAP_CLASSES = {
  md: 'space-y-4',
  lg: 'space-y-6',
} as const;

const PADDING_CLASSES = {
  none: '',
  page: 'p-6',
} as const;

type PageStackElement = 'div' | 'main' | 'section';

export type PageStackProps = ComponentPropsWithoutRef<'div'> & {
  as?: PageStackElement;
  gap?: keyof typeof GAP_CLASSES;
  padding?: keyof typeof PADDING_CLASSES;
};

export function PageStack({
  as: Component = 'div',
  className,
  gap = 'lg',
  padding = 'page',
  ...props
}: Readonly<PageStackProps>) {
  return (
    <Component className={cn(PADDING_CLASSES[padding], GAP_CLASSES[gap], className)} {...props} />
  );
}

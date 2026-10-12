import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

// Sections sit 24px apart on desktop and 16px apart below 640px.
const GAP_CLASSES = {
  md: 'space-y-4',
  lg: 'space-y-4 sm:space-y-6',
} as const;

// The page gutter is 24px on desktop and 16px below 640px.
const PADDING_CLASSES = {
  none: '',
  page: 'p-4 sm:p-6',
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

import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const SPACING_CLASSES = {
  none: '',
  md: 'space-y-4',
  lg: 'space-y-6',
} as const;

type ContentSectionElement = 'div' | 'section';

export type ContentSectionProps = ComponentPropsWithoutRef<'section'> & {
  as?: ContentSectionElement;
  spacing?: keyof typeof SPACING_CLASSES;
};

export function ContentSection({
  as: Component = 'section',
  className,
  spacing = 'none',
  ...props
}: Readonly<ContentSectionProps>) {
  return <Component className={cn(SPACING_CLASSES[spacing], className)} {...props} />;
}

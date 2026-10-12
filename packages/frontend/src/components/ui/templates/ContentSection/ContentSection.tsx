import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Blocks inside a section are 16px apart; `lg` is 24px on desktop and 16px below 640px.
const SPACING_CLASSES = {
  none: '',
  md: 'space-y-4',
  lg: 'space-y-4 sm:space-y-6',
} as const;

type ContentSectionElement = 'div' | 'section';

export type ContentSectionProps = Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  as?: ContentSectionElement;
  spacing?: keyof typeof SPACING_CLASSES;
  /** Section heading, set in the section title style with 12px to the content. */
  title?: ReactNode;
  /** Classes for the block that holds the children; only used with a `title`. */
  contentClassName?: string;
};

export function ContentSection({
  as: Component = 'section',
  className,
  contentClassName,
  spacing = 'none',
  title,
  children,
  ...props
}: Readonly<ContentSectionProps>) {
  const titleId = useId();

  if (title === undefined) {
    return (
      <Component className={cn(SPACING_CLASSES[spacing], className)} {...props}>
        {children}
      </Component>
    );
  }

  return (
    <Component
      className={cn('flex flex-col gap-3', className)}
      {...(Component === 'section' ? { 'aria-labelledby': titleId } : {})}
      {...props}
    >
      <h2 id={titleId} className="text-title-section text-fg">
        {title}
      </h2>
      <div className={cn(SPACING_CLASSES[spacing], contentClassName)}>{children}</div>
    </Component>
  );
}

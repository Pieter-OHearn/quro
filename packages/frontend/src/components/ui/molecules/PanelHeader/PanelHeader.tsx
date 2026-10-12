import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// A card header is 36px high with 12px side padding on desktop, 44px and 16px on phones.
const SPACING_CLASSES = {
  none: '',
  panel: 'min-h-9 px-3 py-1 max-sm:min-h-11 max-sm:px-4',
} as const;

export type PanelHeaderProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  spacing?: keyof typeof SPACING_CLASSES;
  divider?: boolean;
  contentClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  actionClassName?: string;
};

export function PanelHeader({
  title,
  subtitle,
  action,
  spacing = 'panel',
  divider = true,
  className,
  contentClassName,
  titleClassName,
  subtitleClassName,
  actionClassName,
  ...props
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        divider && 'border-b border-border-default',
        SPACING_CLASSES[spacing],
        className,
      )}
      {...props}
    >
      <div className={cn('min-w-0', contentClassName)}>
        <h3 className={cn('text-title-section text-fg', titleClassName)}>{title}</h3>
        {subtitle && (
          <p className={cn('text-caption text-fg-subtle', subtitleClassName)}>{subtitle}</p>
        )}
      </div>
      {action && (
        <div className={cn('flex shrink-0 items-center gap-2', actionClassName)}>{action}</div>
      )}
    </div>
  );
}

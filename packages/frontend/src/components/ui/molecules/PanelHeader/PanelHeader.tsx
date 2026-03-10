import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const SPACING_CLASSES = {
  none: '',
  panel: 'px-6 py-5',
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
        'flex items-center justify-between gap-4',
        divider && 'border-b border-slate-100',
        SPACING_CLASSES[spacing],
        className,
      )}
      {...props}
    >
      <div className={cn('min-w-0', contentClassName)}>
        <h3 className={cn('font-semibold text-slate-900', titleClassName)}>{title}</h3>
        {subtitle && (
          <p className={cn('text-xs text-slate-400 mt-0.5', subtitleClassName)}>{subtitle}</p>
        )}
      </div>
      {action && <div className={cn('flex-shrink-0', actionClassName)}>{action}</div>}
    </div>
  );
}

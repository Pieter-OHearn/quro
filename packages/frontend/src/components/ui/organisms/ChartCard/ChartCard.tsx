import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '../../atoms';
import { PanelHeader } from '../../molecules';

export type ChartCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  hasData: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** A row under the chart, shown with or without data, such as a phone's range control. */
  belowContent?: ReactNode;
  emptyMessage?: ReactNode;
  className?: string;
  headerClassName?: string;
  headerActionClassName?: string;
  contentClassName?: string;
  emptyStateClassName?: string;
};

export function ChartCard({
  title,
  subtitle,
  badge,
  hasData,
  children,
  footer,
  belowContent,
  emptyMessage = 'No data yet.',
  className,
  headerClassName,
  headerActionClassName,
  contentClassName,
  emptyStateClassName,
}: Readonly<ChartCardProps>) {
  // A 36px card header, then the chart on 16px padding.
  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        action={badge}
        className={headerClassName}
        actionClassName={headerActionClassName}
      />

      {hasData ? (
        <div className="p-4">
          <div className={contentClassName}>{children}</div>
          {footer}
        </div>
      ) : (
        <div className={cn('px-4 py-12 text-center text-cell text-fg-subtle', emptyStateClassName)}>
          {emptyMessage}
        </div>
      )}
      {belowContent ? (
        <div className="border-t border-border-subtle px-4 py-2">{belowContent}</div>
      ) : null}
    </Card>
  );
}

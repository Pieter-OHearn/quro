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
  emptyMessage?: ReactNode;
  className?: string;
  headerClassName?: string;
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
  emptyMessage = 'No data yet.',
  className,
  headerClassName,
  contentClassName,
  emptyStateClassName,
}: Readonly<ChartCardProps>) {
  return (
    <Card className={className}>
      <PanelHeader
        title={title}
        subtitle={subtitle}
        action={badge}
        spacing="none"
        divider={false}
        className={cn('mb-5', headerClassName)}
      />

      {hasData ? (
        <>
          <div className={contentClassName}>{children}</div>
          {footer}
        </>
      ) : (
        <div className={cn('py-12 text-center text-sm text-slate-400', emptyStateClassName)}>
          {emptyMessage}
        </div>
      )}
    </Card>
  );
}

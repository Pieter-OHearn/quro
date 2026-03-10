import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '../../atoms';
import { PanelHeader } from '../../molecules';

const ALIGNMENT_CLASSES = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

export type DataTableColumn = {
  key: string;
  header?: ReactNode;
  align?: keyof typeof ALIGNMENT_CLASSES;
  headerClassName?: string;
};

export type DataTableProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  columns: readonly DataTableColumn[];
  children?: ReactNode;
  isEmpty?: boolean;
  emptyState?: ReactNode;
  colGroup?: ReactNode;
  minWidth?: number | string;
  tableLayout?: 'auto' | 'fixed';
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  tableClassName?: string;
};

function getTableStyle(minWidth?: number | string): CSSProperties | undefined {
  if (typeof minWidth === 'undefined') return undefined;

  return {
    minWidth: typeof minWidth === 'number' ? `${minWidth}px` : minWidth,
  };
}

export function DataTable({
  title,
  subtitle,
  action,
  columns,
  children,
  isEmpty = false,
  emptyState = 'No data yet.',
  colGroup,
  minWidth,
  tableLayout = 'auto',
  className,
  headerClassName,
  bodyClassName,
  tableClassName,
}: Readonly<DataTableProps>) {
  const tableStyle = getTableStyle(minWidth);

  return (
    <Card padding="none" className={cn('overflow-hidden', className)}>
      <PanelHeader title={title} subtitle={subtitle} action={action} className={headerClassName} />

      <div className={cn('overflow-x-auto', bodyClassName)}>
        <table
          className={cn('w-full text-sm', tableLayout === 'fixed' && 'table-fixed', tableClassName)}
          style={tableStyle}
        >
          {colGroup}
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap',
                    ALIGNMENT_CLASSES[column.align ?? 'left'],
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-slate-400"
                >
                  {emptyState}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

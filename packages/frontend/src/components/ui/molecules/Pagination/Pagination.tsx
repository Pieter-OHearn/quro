import type { ComponentPropsWithoutRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_BUTTON_CLASS_NAME =
  'w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400';

const PAGE_BUTTON_CLASS_NAME = 'w-7 h-7 rounded-md text-xs font-semibold transition-colors';
const ACTIVE_PAGE_CLASS_NAME = 'bg-indigo-600 text-white';
const INACTIVE_PAGE_CLASS_NAME = 'text-slate-500 hover:bg-slate-100';
const DEFAULT_VISIBLE_PAGE_COUNT = 5;

function clampPage(page: number, totalPages: number) {
  return Math.max(1, Math.min(totalPages, page));
}

export type PaginationProps = Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> & {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  totalCount: number;
  onChange: (page: number) => void;
  visiblePageCount?: number;
  activePageClassName?: string;
  inactivePageClassName?: string;
  rangeClassName?: string;
};

export function Pagination({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  totalCount,
  onChange,
  visiblePageCount = DEFAULT_VISIBLE_PAGE_COUNT,
  activePageClassName = ACTIVE_PAGE_CLASS_NAME,
  inactivePageClassName = INACTIVE_PAGE_CLASS_NAME,
  rangeClassName,
  className,
  ...props
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = clampPage(page, safeTotalPages);
  const lastWindowStart = Math.max(1, safeTotalPages - visiblePageCount + 1);
  const windowStart =
    safeTotalPages <= visiblePageCount
      ? 1
      : Math.min(Math.max(1, safePage - (visiblePageCount - 1)), lastWindowStart);
  const windowEnd = Math.min(safeTotalPages, windowStart + visiblePageCount - 1);
  const pageNumbers = Array.from(
    { length: windowEnd - windowStart + 1 },
    (_, index) => windowStart + index,
  );

  const handleChange = (nextPage: number) => {
    const clampedPage = clampPage(nextPage, safeTotalPages);

    if (clampedPage !== safePage) {
      onChange(clampedPage);
    }
  };

  return (
    <div
      className={cn(
        'mt-3 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-3 flex-wrap',
        className,
      )}
      {...props}
    >
      <p className={cn('text-xs text-slate-400', rangeClassName)}>
        {rangeStart}-{rangeEnd} of {totalCount}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleChange(safePage - 1)}
          disabled={safePage === 1}
          aria-label="Previous page"
          className={NAV_BUTTON_CLASS_NAME}
        >
          <ChevronLeft size={14} className="mx-auto" />
        </button>
        {pageNumbers.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => handleChange(pageNumber)}
            aria-current={pageNumber === safePage ? 'page' : undefined}
            className={cn(
              PAGE_BUTTON_CLASS_NAME,
              pageNumber === safePage ? activePageClassName : inactivePageClassName,
            )}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          onClick={() => handleChange(safePage + 1)}
          disabled={safePage === safeTotalPages}
          aria-label="Next page"
          className={NAV_BUTTON_CLASS_NAME}
        >
          <ChevronRight size={14} className="mx-auto" />
        </button>
      </div>
    </div>
  );
}

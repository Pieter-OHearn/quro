import type { ComponentPropsWithoutRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// 28px square buttons with a control border, 44px on phones. The current page is a
// `brand-soft` tint, never a fill, because a `brand` fill is kept for the one action button.
const BUTTON_BASE_CLASS_NAME =
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-control text-caption font-numeric transition-colors duration-fast max-sm:h-11 max-sm:w-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring';

const NAV_BUTTON_CLASS_NAME = cn(
  BUTTON_BASE_CLASS_NAME,
  'bg-surface text-fg-muted hover:bg-surface-muted active:bg-surface-muted disabled:cursor-not-allowed disabled:border-border-default disabled:bg-surface disabled:text-fg-faint',
);

const PAGE_BUTTON_CLASS_NAME = BUTTON_BASE_CLASS_NAME;
const ACTIVE_PAGE_CLASS_NAME = 'bg-brand-soft font-semibold text-brand-fg';
const INACTIVE_PAGE_CLASS_NAME =
  'bg-surface text-fg hover:bg-surface-muted active:bg-surface-muted';
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
    <div className={cn('flex flex-wrap items-center justify-between gap-2', className)} {...props}>
      <p className={cn('text-caption font-numeric text-fg-muted', rangeClassName)}>
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
          <ChevronLeft size={14} aria-hidden="true" />
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
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '@/components/ui';

type MonthYearSelectorProps = {
  month: string;
  year: number;
  isCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export function MonthYearSelector({
  month,
  year,
  isCurrentMonth,
  onPrev,
  onNext,
}: Readonly<MonthYearSelectorProps>) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        onClick={onPrev}
        icon={ChevronLeft}
        label="Previous month"
        size="sm"
        variant="subtle"
        className="h-7 w-7"
      />
      <span className="min-w-[90px] text-center text-sm font-medium text-fg-muted">
        {month} {year}
      </span>
      <IconButton
        onClick={onNext}
        disabled={isCurrentMonth}
        icon={ChevronRight}
        label="Next month"
        size="sm"
        variant="subtle"
        className="h-7 w-7"
      />
    </div>
  );
}

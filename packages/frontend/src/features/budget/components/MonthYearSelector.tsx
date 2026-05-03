import { ChevronLeft, ChevronRight } from 'lucide-react';

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
      <button
        onClick={onPrev}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="min-w-[90px] text-center text-sm font-medium text-slate-700">
        {month} {year}
      </span>
      <button
        onClick={onNext}
        disabled={isCurrentMonth}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next month"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

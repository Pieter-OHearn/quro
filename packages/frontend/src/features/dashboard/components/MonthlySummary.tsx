import { CalendarDays } from 'lucide-react';
import { StatCard } from '@/components/ui';
import type { MonthlySummaryItem } from '../types';

export function MonthlySummary({
  items,
}: Readonly<{
  items: readonly MonthlySummaryItem[];
}>) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={item.value}
          icon={CalendarDays}
          color="indigo"
        />
      ))}
    </div>
  );
}

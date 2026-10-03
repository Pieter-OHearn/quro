import { lazy, Suspense } from 'react';
import type { AreaChartCard as AreaChartCardComponent, AreaChartCardProps } from './AreaChartCard';
import { ChartCard } from '../ChartCard';

export type { AreaChartCardProps } from './AreaChartCard';

// The UI barrel is used by app providers, so chart runtime imports must stay deferred.
const LazyAreaChartCard = lazy(async () => ({
  default: (await import('./AreaChartCard')).AreaChartCard,
})) as typeof AreaChartCardComponent;

export function AreaChartCard<T extends Record<string, unknown>>(props: AreaChartCardProps<T>) {
  return (
    <Suspense
      fallback={
        <ChartCard
          title={props.title}
          subtitle={props.subtitle}
          badge={props.badge}
          hasData
          className={props.className}
        >
          <div
            role="status"
            style={{ height: props.height ?? 180 }}
            className="flex items-center justify-center text-fg-muted"
          >
            Loading chart…
          </div>
        </ChartCard>
      }
    >
      <LazyAreaChartCard {...props} />
    </Suspense>
  );
}

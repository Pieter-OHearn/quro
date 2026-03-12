import { formatUnknownErrorDetail } from '@/components/errors/errorFormatting';

export type RouteQueryState = {
  label: string;
  data: unknown;
  error: unknown;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

export type FailedRouteQuery = Pick<RouteQueryState, 'label' | 'error' | 'isFetching' | 'refetch'>;

export function getFailedRouteQueries(queries: readonly RouteQueryState[]): FailedRouteQuery[] {
  return queries
    .filter((query) => query.isError && query.data === undefined)
    .map(({ label, error, isFetching, refetch }) => ({
      label,
      error,
      isFetching,
      refetch,
    }));
}

export async function retryFailedRouteQueries(
  failedQueries: readonly FailedRouteQuery[],
): Promise<void> {
  await Promise.allSettled(failedQueries.map((query) => query.refetch()));
}

export function formatRouteQueryErrorDetail(
  failedQueries: readonly FailedRouteQuery[],
): string | undefined {
  const details = failedQueries
    .map((query) => {
      const detail = formatUnknownErrorDetail(query.error) ?? 'Request failed';
      return `${query.label}\n${detail}`;
    })
    .filter((detail) => detail.trim().length > 0);

  if (details.length === 0) return undefined;
  return details.join('\n\n---\n\n');
}

export function formatRouteQueryLabelList(labels: readonly string[]): string {
  if (labels.length === 0) return 'required data';
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;

  const leadingLabels = labels.slice(0, -1).join(', ');
  return `${leadingLabels}, and ${labels[labels.length - 1]}`;
}

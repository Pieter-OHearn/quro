import { useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button, Card, ContentSection, PageStack } from '@/components/ui';
import {
  formatRouteQueryErrorDetail,
  formatRouteQueryLabelList,
  retryFailedRouteQueries,
  type FailedRouteQuery,
} from '@/lib/routeQueryErrors';
import { ErrorBadge } from './ErrorBadge';

type RouteQueryErrorStateProps = {
  routeName: string;
  failedQueries: readonly FailedRouteQuery[];
};

type RouteQueryActionsProps = {
  failedQueries: readonly FailedRouteQuery[];
  retrying: boolean;
};

function RouteQueryActions({ failedQueries, retrying }: Readonly<RouteQueryActionsProps>) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button
        loading={retrying}
        loadingLabel="Retrying failed requests"
        leadingIcon={!retrying ? <RefreshCw size={16} /> : undefined}
        onClick={() => {
          void retryFailedRouteQueries(failedQueries);
        }}
      >
        Retry failed requests
      </Button>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Reload app
      </Button>
    </div>
  );
}

function FailedRequestList({ failedLabels }: { failedLabels: readonly string[] }) {
  return (
    <div>
      <p className="text-label text-fg-muted">Failed requests</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {failedLabels.map((label) => (
          <li
            key={label}
            className="rounded-sm border border-border-default bg-surface-sunken px-2 py-0.5 text-cell text-fg"
          >
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

type RouteQueryErrorDetailsProps = {
  detail: string | undefined;
  showDetails: boolean;
  onToggle: () => void;
};

function RouteQueryErrorDetails({
  detail,
  showDetails,
  onToggle,
}: Readonly<RouteQueryErrorDetailsProps>) {
  if (!detail) return null;

  return (
    <div>
      <button
        type="button"
        aria-expanded={showDetails}
        onClick={onToggle}
        className="flex min-h-8 w-full items-center justify-between rounded-md border border-border-default bg-surface px-3 py-1.5 text-left text-cell text-fg transition-colors duration-fast hover:bg-surface-muted active:bg-surface-muted max-sm:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      >
        <span>Technical details</span>
        {showDetails ? (
          <ChevronUp size={16} className="text-fg-muted" aria-hidden="true" />
        ) : (
          <ChevronDown size={16} className="text-fg-muted" aria-hidden="true" />
        )}
      </button>

      {showDetails ? (
        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border-default bg-surface-sunken p-3 text-caption text-fg">
          {detail}
        </pre>
      ) : null}
    </div>
  );
}

export function RouteQueryErrorState({
  routeName,
  failedQueries,
}: Readonly<RouteQueryErrorStateProps>) {
  const [showDetails, setShowDetails] = useState(false);
  const retrying = failedQueries.some((query) => query.isFetching);
  const failedLabels = failedQueries.map((query) => query.label);
  const failedSummary = formatRouteQueryLabelList(failedLabels);
  const detail = formatRouteQueryErrorDetail(failedQueries);

  return (
    <PageStack as="main">
      <ContentSection>
        <Card padding="none" className="overflow-hidden" role="alert">
          <div className="flex min-h-9 items-center border-b border-border-default px-3 py-1 max-sm:min-h-11 max-sm:px-4">
            <ErrorBadge>Route data unavailable</ErrorBadge>
          </div>

          <div className="space-y-4 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-title-page text-fg">
                  {routeName} data is temporarily unavailable
                </h1>
                <p className="mt-1 max-w-2xl text-body text-fg-muted">
                  Quro paused this page because {failedSummary} could not be fetched safely. This is
                  not the same as an empty state, and retrying will refetch only the failed
                  requests.
                </p>
              </div>

              <RouteQueryActions failedQueries={failedQueries} retrying={retrying} />
            </div>

            <FailedRequestList failedLabels={failedLabels} />
            <RouteQueryErrorDetails
              detail={detail}
              showDetails={showDetails}
              onToggle={() => setShowDetails((value) => !value)}
            />
          </div>
        </Card>
      </ContentSection>
    </PageStack>
  );
}

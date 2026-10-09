import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button, Card, ContentSection, PageStack } from '@/components/ui';
import {
  formatRouteQueryErrorDetail,
  formatRouteQueryLabelList,
  retryFailedRouteQueries,
  type FailedRouteQuery,
} from '@/lib/routeQueryErrors';

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
    <div className="flex flex-wrap gap-3">
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
    <div className="rounded-lg border border-border-default bg-surface-sunken p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-subtle">
        Failed requests
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {failedLabels.map((label) => (
          <span
            key={label}
            className="rounded-sm border border-border-default bg-surface px-3 py-1 text-sm text-fg-strong"
          >
            {label}
          </span>
        ))}
      </div>
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
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-md border border-border-default bg-surface px-4 py-3 text-left text-sm text-fg-muted transition-colors hover:bg-surface-sunken"
      >
        <span>Technical details</span>
        {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {showDetails ? (
        <pre className="mt-3 overflow-auto rounded-lg border border-fg-emphasis bg-fg-deep p-4 text-xs leading-6 text-danger-border">
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
        <Card padding="none" className="overflow-hidden border-danger-soft-strong" role="alert">
          <div className="border-b border-danger-soft-strong bg-gradient-to-r from-danger-soft via-surface to-warning-soft px-6 py-4">
            <span className="inline-flex items-center gap-2 rounded-sm border border-danger-border bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-danger-hover">
              <AlertTriangle size={14} />
              Route Data Unavailable
            </span>
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-danger-soft-strong text-danger-hover">
                  <AlertTriangle size={26} strokeWidth={1.8} />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-fg">
                    {routeName} data is temporarily unavailable
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-muted">
                    Quro paused this page because {failedSummary} could not be fetched safely. This
                    is not the same as an empty state, and retrying will refetch only the failed
                    requests.
                  </p>
                </div>
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

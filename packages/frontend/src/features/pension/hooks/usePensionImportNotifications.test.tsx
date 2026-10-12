/// <reference types="bun-types" />
import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import type { PensionStatementImportFeedItem } from '@quro/shared';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { invalidatePensionImport } from '@/lib/queryInvalidation';
import { APP_CAPABILITIES_QUERY_KEY, DEFAULT_APP_CAPABILITIES } from '@/lib/useAppCapabilities';
import { usePensionImportNotifications } from './usePensionImportNotifications';

afterEach(() => mock.restore());
const feedItem = (
  status: PensionStatementImportFeedItem['import']['status'],
): PensionStatementImportFeedItem => ({
  import: { id: 1, status } as PensionStatementImportFeedItem['import'],
  pot: { id: 1, name: 'Pension', provider: 'Provider', emoji: null },
});

const key = queryKeys.pensions.notificationList('queued,processing,ready_for_review,failed', 30);

// The import service is configured; its worker is down, as in DEFAULT_APP_CAPABILITIES.
function notificationQuery(importReason: 'worker_unavailable' | 'not_configured') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(APP_CAPABILITIES_QUERY_KEY, {
    ...DEFAULT_APP_CAPABILITIES,
    pensionStatementImport: {
      ...DEFAULT_APP_CAPABILITIES.pensionStatementImport,
      reason: importReason,
    },
  });
  function Probe() {
    usePensionImportNotifications();
    return null;
  }
  renderToString(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  const query = client.getQueryCache().find<PensionStatementImportFeedItem[]>({ queryKey: key });
  if (!query) throw new Error('Notification query not registered');
  return { client, query };
}

test('without a configured import service the feed is empty and its route is never called', async () => {
  const get = spyOn(api, 'get');
  const { client, query } = notificationQuery('not_configured');
  try {
    expect(await client.fetchQuery({ ...query.options, queryKey: key })).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  } finally {
    client.clear();
  }
});

test('polls only active jobs and restarts when a new import invalidates the idle feed', async () => {
  const { client, query } = notificationQuery('worker_unavailable');
  const interval = query.options.refetchInterval;
  if (typeof interval !== 'function') throw new Error('Expected data-driven polling');
  expect(interval(query)).toBe(false);
  for (const status of ['ready_for_review', 'failed', 'committed', 'cancelled'] as const) {
    client.setQueryData(key, [feedItem(status)]);
    expect(interval(query)).toBe(false);
  }
  const get = spyOn(api, 'get').mockResolvedValue({ data: { data: [feedItem('queued')] } });
  const observer = new QueryObserver(client, { ...query.options, queryKey: key });
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await invalidatePensionImport(client, 1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(interval(query)).toBe(2000);
    client.setQueryData(key, [feedItem('processing')]);
    expect(interval(query)).toBe(2000);
    get.mockResolvedValue({ data: { data: [feedItem('ready_for_review')] } });
    await observer.refetch();
    expect(interval(query)).toBe(false);
  } finally {
    unsubscribe();
    client.clear();
  }
});

/// <reference types="bun-types" />

import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import axios from 'axios';
import type { BunqConnection } from '@quro/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { APP_CAPABILITIES_QUERY_KEY, DEFAULT_APP_CAPABILITIES } from '@/lib/useAppCapabilities';
import { useBunqConnection } from './useBunqConnection';

const clients: QueryClient[] = [];

afterEach(() => {
  mock.restore();
  for (const client of clients) client.clear();
  clients.length = 0;
});

function connectionQuery(bunqEnabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  client.setQueryData(APP_CAPABILITIES_QUERY_KEY, {
    ...DEFAULT_APP_CAPABILITIES,
    bunq: { ...DEFAULT_APP_CAPABILITIES.bunq, enabled: bunqEnabled, reason: null },
  });
  function ConnectionProbe() {
    useBunqConnection();
    return null;
  }
  renderToString(
    <QueryClientProvider client={client}>
      <ConnectionProbe />
    </QueryClientProvider>,
  );
  const query = client.getQueryCache().find({ queryKey: queryKeys.bunqConnection });
  if (!query) throw new Error('Bunq connection query was not registered');
  return {
    client,
    fetch: () => client.fetchQuery({ ...query.options, queryKey: queryKeys.bunqConnection }),
  };
}

test('a missing Bunq connection is a successful null result', async () => {
  spyOn(api, 'get').mockRejectedValue(
    new axios.AxiosError('Not found', undefined, undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      data: { error: 'No Bunq connection' },
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    }),
  );
  const query = connectionQuery();
  expect(await query.fetch()).toBeNull();
  expect(query.client.getQueryState(queryKeys.bunqConnection)?.status).toBe('success');
});

test('a connected account retains its API payload', async () => {
  const connection: BunqConnection = {
    id: 1,
    userId: 2,
    bunqUserId: '123',
    lastSyncAt: '2026-10-02T10:00:00.000Z',
    syncStatus: 'idle',
    syncError: null,
    createdAt: '2026-10-01T10:00:00.000Z',
  };
  spyOn(api, 'get').mockResolvedValue({ data: { data: connection } });
  const query = connectionQuery();
  expect(await query.fetch()).toEqual(connection);
});

test('other request failures remain query errors', async () => {
  const error = new Error('Network unavailable');
  spyOn(api, 'get').mockRejectedValue(error);
  const query = connectionQuery();
  await expect(query.fetch()).rejects.toBe(error);
  expect(query.client.getQueryState(queryKeys.bunqConnection)?.status).toBe('error');
});

test('Bunq server errors are not treated as disconnected accounts', async () => {
  const error = new axios.AxiosError('Service unavailable', undefined, undefined, undefined, {
    status: 503,
    statusText: 'Service Unavailable',
    data: { error: 'Bunq is unavailable' },
    headers: {},
    config: { headers: new axios.AxiosHeaders() },
  });
  spyOn(api, 'get').mockRejectedValue(error);
  const query = connectionQuery();
  await expect(query.fetch()).rejects.toBe(error);
  expect(query.client.getQueryState(queryKeys.bunqConnection)?.status).toBe('error');
});

test('without bunq configured the connection is null and its route is never called', async () => {
  const get = spyOn(api, 'get');
  const query = connectionQuery(false);
  expect(await query.fetch()).toBeNull();
  expect(get).not.toHaveBeenCalled();
});

test('the capabilities are fetched first when none are cached', async () => {
  const get = spyOn(api, 'get').mockResolvedValue({ data: { data: DEFAULT_APP_CAPABILITIES } });
  const query = connectionQuery();
  query.client.removeQueries({ queryKey: APP_CAPABILITIES_QUERY_KEY });
  expect(await query.fetch()).toBeNull();
  expect(get.mock.calls.map(([url]) => url)).toEqual(['/api/capabilities']);
});

test('an unreadable capabilities response still asks for the connection', async () => {
  const get = spyOn(api, 'get').mockImplementation((url: string) =>
    url === '/api/capabilities'
      ? Promise.reject(new Error('Capabilities unavailable'))
      : Promise.resolve({ data: { data: null } }),
  );
  const query = connectionQuery();
  query.client.removeQueries({ queryKey: APP_CAPABILITIES_QUERY_KEY });
  expect(await query.fetch()).toBeNull();
  expect(get.mock.calls.map(([url]) => url)).toEqual(['/api/capabilities', '/api/bunq/connection']);
});

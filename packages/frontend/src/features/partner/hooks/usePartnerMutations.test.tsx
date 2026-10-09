/// <reference types="bun-types" />

import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useUnlinkPartner } from './usePartnerMutations';

const clients: QueryClient[] = [];

afterEach(() => {
  mock.restore();
  for (const client of clients) client.clear();
  clients.length = 0;
});

function unlinkMutation() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  let mutation!: ReturnType<typeof useUnlinkPartner>;
  function Probe() {
    mutation = useUnlinkPartner();
    return null;
  }
  renderToString(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  return { client, mutation };
}

test('unlinking a partner removes the joint rows from the cache', async () => {
  spyOn(api, 'delete').mockResolvedValue({ data: { data: null } });
  const { client, mutation } = unlinkMutation();
  client.setQueryData(queryKeys.savings.accountList(false), [{ id: 1, name: 'Joint account' }]);
  client.setQueryData(queryKeys.mortgages.all, [{ id: 2 }]);
  client.setQueryData(queryKeys.goals, [{ id: 3 }]);

  await mutation.mutateAsync();

  expect(client.getQueryData(queryKeys.savings.accountList(false))).toBeUndefined();
  expect(client.getQueryData(queryKeys.mortgages.all)).toBeUndefined();
  // Data that never involved the partner stays.
  expect(client.getQueryData(queryKeys.goals)).toEqual([{ id: 3 }]);
});

test('a failed unlink keeps what is on screen', async () => {
  spyOn(api, 'delete').mockRejectedValue(new Error('network'));
  const { client, mutation } = unlinkMutation();
  client.setQueryData(queryKeys.savings.accountList(false), [{ id: 1, name: 'Joint account' }]);

  await expect(mutation.mutateAsync()).rejects.toThrow('network');

  expect(client.getQueryData(queryKeys.savings.accountList(false))).toEqual([
    { id: 1, name: 'Joint account' },
  ]);
});

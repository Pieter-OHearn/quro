import { afterEach, expect, test } from 'bun:test';
import { clearAuthQueryCache } from './authCache';
import { queryClient } from './queryClient';

afterEach(() => queryClient.clear());

test('removes all cached financial data at an authentication boundary', () => {
  queryClient.setQueryData(['dashboard', 'netWorth'], { value: 125_000 });
  queryClient.setQueryData(['savings', 'accounts'], [{ balance: 25_000 }]);

  clearAuthQueryCache();

  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(queryClient.getQueryData(['dashboard', 'netWorth'])).toBeUndefined();
  expect(queryClient.getQueryData(['savings', 'accounts'])).toBeUndefined();
});

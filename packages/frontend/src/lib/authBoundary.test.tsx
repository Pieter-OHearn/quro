/// <reference types="bun-types" />

import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { isCancelledError } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import type { User } from '@quro/shared';
import { api } from './api';
import { AuthProvider, useAuth } from './AuthContext';
import { queryClient } from './queryClient';
import { queryKeys } from './queryKeys';

type Auth = ReturnType<typeof useAuth>;

const quietConsole = () => spyOn(console, 'error').mockImplementation(() => undefined);

afterEach(() => {
  mock.restore();
  queryClient.clear();
});

// The provider's callbacks are built while it renders; the server renderer is enough to reach them.
function renderAuth(): Auth {
  let auth!: Auth;
  function Probe() {
    auth = useAuth();
    return null;
  }
  renderToString(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  return auth;
}

function user(id: number): User {
  return { id, email: `user-${id}@example.test` } as User;
}

function cacheFinancialData(label: string) {
  queryClient.setQueryData(queryKeys.dashboard.summary, { owner: label, netWorth: 125_000 });
  queryClient.setQueryData(queryKeys.savings.accountList(false), [{ id: 1, name: label }]);
  queryClient.setQueryData(queryKeys.partner, { partner: { email: `${label}@example.test` } });
  queryClient.setQueryData(queryKeys.sessions, [{ id: 'digest' }]);
}

function cachedQueries() {
  return queryClient.getQueryCache().getAll().length;
}

test('signing in as another user leaves nothing of the previous user in the cache', async () => {
  quietConsole();
  cacheFinancialData('first-user');
  spyOn(api, 'post').mockResolvedValue({ data: { data: user(2) } });
  const auth = renderAuth();

  await auth.signIn('second@example.test', 'a-password');

  expect(cachedQueries()).toBe(0);
});

test('signing up and redeeming a recovery code also start from an empty cache', async () => {
  quietConsole();
  spyOn(api, 'post').mockResolvedValue({ data: { data: user(3) } });
  const auth = renderAuth();

  cacheFinancialData('before-sign-up');
  await auth.signUp({ firstName: 'A', lastName: 'B', email: 'a@example.test', password: 'x' });
  expect(cachedQueries()).toBe(0);

  cacheFinancialData('before-reset');
  await auth.resetPassword({ code: 'AAAAA-BBBBB-CCCCC-DDDDD', nextPassword: 'another-password' });
  expect(cachedQueries()).toBe(0);
});

test('signing out empties the cache once the server has ended the session', async () => {
  quietConsole();
  cacheFinancialData('signed-in-user');
  const post = spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
  const auth = renderAuth();

  await auth.signOut();

  expect(post).toHaveBeenCalledWith('/api/auth/signout');
  expect(cachedQueries()).toBe(0);
});

test('a sign-out the server did not complete keeps the user signed in with their own data', async () => {
  quietConsole();
  cacheFinancialData('signed-in-user');
  spyOn(api, 'post').mockRejectedValue(new Error('network'));
  const auth = renderAuth();

  await expect(auth.signOut()).rejects.toThrow('network');

  expect(cachedQueries()).toBe(4);
});

test('a response that arrives after sign-out is not cached for the next user', async () => {
  quietConsole();
  let release: (value: unknown) => void = () => undefined;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  // Clearing the cache cancels the request, so its late answer has nowhere to land.
  const request = queryClient
    .fetchQuery({ queryKey: queryKeys.savings.accountList(true), queryFn: () => slow })
    .catch((error: unknown) => error);
  spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
  const auth = renderAuth();

  await auth.signOut();
  release([{ id: 99, name: 'late response for the previous user' }]);
  const outcome = await request;
  expect(isCancelledError(outcome)).toBe(true);

  expect(queryClient.getQueryData(queryKeys.savings.accountList(true))).toBeUndefined();
  expect(cachedQueries()).toBe(0);
});

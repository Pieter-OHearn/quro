/// <reference types="bun-types" />

import { expect, mock, test } from 'bun:test';
import {
  buildApiUrl,
  notifyUnauthorizedResponse,
  registerUnauthorizedHandler,
  resolveApiBaseUrl,
} from './api';

test('uses same-origin api paths when no override value is provided', () => {
  expect(resolveApiBaseUrl('')).toBe('');
  expect(buildApiUrl('/api/health', '')).toBe('/api/health');
  expect(buildApiUrl('api/health', '')).toBe('/api/health');
});

test('applies an explicit API host override for split frontend/backend development', () => {
  expect(resolveApiBaseUrl(' http://localhost:3000/ ')).toBe('http://localhost:3000');
  expect(buildApiUrl('/api/health', 'http://localhost:3000/')).toBe(
    'http://localhost:3000/api/health',
  );
});

test('preserves absolute download URLs unchanged', () => {
  expect(buildApiUrl('https://cdn.example.com/files/payslip.pdf', undefined)).toBe(
    'https://cdn.example.com/files/payslip.pdf',
  );
});

test('notifies auth state when a protected request returns 401', () => {
  const handler = mock(() => undefined);
  const unregister = registerUnauthorizedHandler(handler);

  notifyUnauthorizedResponse(401, '/api/savings/accounts');

  expect(handler).toHaveBeenCalledTimes(1);
  unregister();
});

test('ignores expected auth endpoint 401 responses', () => {
  const handler = mock(() => undefined);
  const unregister = registerUnauthorizedHandler(handler);

  notifyUnauthorizedResponse(401, '/api/auth/me');
  notifyUnauthorizedResponse(401, '/api/auth/signin');
  notifyUnauthorizedResponse(403, '/api/savings/accounts');

  expect(handler).not.toHaveBeenCalled();
  unregister();
});

// A real Axios adapter verifies envelope unwrapping without replacing the API client.
test('typed API helpers unwrap payloads and preserve request configuration', async () => {
  const { apiGet, apiPost, apiPatch, apiPut, apiDelete } = await import('./api');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { cookie: 'csrf_token=test-token' },
  });
  const requests: Array<{ method?: string; url?: string; body?: unknown; csrf?: unknown }> = [];
  const config = {
    params: { includeArchived: true },
    adapter: async (request: import('axios').InternalAxiosRequestConfig) => {
      requests.push({
        method: request.method,
        url: request.url,
        body: request.data,
        csrf: request.headers['X-CSRF-Token'],
      });
      expect(request.params).toEqual({ includeArchived: true });
      expect(request.withCredentials).toBe(true);
      return {
        data: { data: { id: 1 } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
      };
    },
  };
  try {
    expect(await apiGet<{ id: number }>('/api/example', config)).toEqual({ id: 1 });
    expect(await apiPost<{ id: number }>('/api/example', { name: 'New' }, config)).toEqual({
      id: 1,
    });
    expect(await apiPatch<{ id: number }>('/api/example/1', { name: 'Updated' }, config)).toEqual({
      id: 1,
    });
    expect(await apiPut<{ id: number }>('/api/example/1', { name: 'Replaced' }, config)).toEqual({
      id: 1,
    });
    expect(await apiDelete<{ id: number }>('/api/example/1', config)).toEqual({ id: 1 });
    expect(requests.map((request) => request.method)).toEqual([
      'get',
      'post',
      'patch',
      'put',
      'delete',
    ]);
    expect(requests[1]?.body).toBe(JSON.stringify({ name: 'New' }));
    expect(requests[0]?.csrf).toBeUndefined();
    expect(requests.slice(1).every((request) => request.csrf === 'test-token')).toBe(true);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('typed API helpers propagate transport failures', async () => {
  const { apiGet } = await import('./api');
  const failure = new Error('Network unavailable');
  await expect(
    apiGet<unknown>('/api/example', { adapter: () => Promise.reject(failure) }),
  ).rejects.toBe(failure);
});

test('shared API error extraction handles server errors, ordinary errors and unknown values', async () => {
  const { readApiErrorMessage, resolveApiErrorMessage } = await import('./api');
  expect(readApiErrorMessage({ response: { data: { error: 'Invalid amount' } } })).toBe(
    'Invalid amount',
  );
  expect(
    resolveApiErrorMessage({ response: { data: { error: 'Invalid amount' } } }, 'Fallback'),
  ).toBe('Invalid amount');
  expect(resolveApiErrorMessage(new Error('Network unavailable'), 'Fallback')).toBe(
    'Network unavailable',
  );
  for (const error of [
    null,
    undefined,
    'failure',
    { response: null },
    { response: { data: { error: 1 } } },
    new Error(' '),
  ]) {
    expect(readApiErrorMessage(error)).toBeNull();
    expect(resolveApiErrorMessage(error, 'Fallback')).toBe('Fallback');
  }
});

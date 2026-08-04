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

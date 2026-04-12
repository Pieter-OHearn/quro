/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { buildApiUrl, resolveApiBaseUrl } from './api';

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

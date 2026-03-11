/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { buildApiUrl, resolveApiBaseUrl } from './api';

test('defaults to same-origin api paths when no override is configured', () => {
  expect(resolveApiBaseUrl(undefined)).toBe('');
  expect(buildApiUrl('/api/health', undefined)).toBe('/api/health');
  expect(buildApiUrl('api/health', undefined)).toBe('/api/health');
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

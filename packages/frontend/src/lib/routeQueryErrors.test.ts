/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import {
  formatRouteQueryErrorDetail,
  formatRouteQueryLabelList,
  getFailedRouteQueries,
  retryFailedRouteQueries,
  type RouteQueryState,
} from './routeQueryErrors';

function createQuery(overrides: Partial<RouteQueryState>): RouteQueryState {
  return {
    label: 'query',
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
    refetch: async () => undefined,
    ...overrides,
  };
}

test('detects only route queries that failed without usable data', () => {
  const failedQueries = getFailedRouteQueries([
    createQuery({
      label: 'payslips',
      error: new Error('Network Error'),
      isError: true,
    }),
    createQuery({
      label: 'salary history',
      data: [],
      error: new Error('Background refetch failed'),
      isError: true,
    }),
    createQuery({
      label: 'goals',
      data: [],
    }),
  ]);

  expect(failedQueries.map((query) => query.label)).toEqual(['payslips']);
});

test('retries only the failed route queries', async () => {
  let retries = 0;

  await retryFailedRouteQueries(
    getFailedRouteQueries([
      createQuery({
        label: 'budget categories',
        error: new Error('Connection lost'),
        isError: true,
        refetch: async () => {
          retries += 1;
          return undefined;
        },
      }),
      createQuery({
        label: 'budget transactions',
        data: [],
        error: new Error('Background refetch failed'),
        isError: true,
        refetch: async () => {
          retries += 10;
          return undefined;
        },
      }),
    ]),
  );

  expect(retries).toBe(1);
});

test('formats query error details and natural-language label lists', () => {
  const failedQueries = getFailedRouteQueries([
    createQuery({
      label: 'pension pots',
      error: new Error('Service unavailable'),
      isError: true,
    }),
    createQuery({
      label: 'pension transactions',
      error: { response: { data: { error: 'Gateway timeout' } } },
      isError: true,
    }),
  ]);

  const detail = formatRouteQueryErrorDetail(failedQueries);

  expect(formatRouteQueryLabelList(failedQueries.map((query) => query.label))).toBe(
    'pension pots and pension transactions',
  );
  expect(detail).toContain('pension pots');
  expect(detail).toContain('Service unavailable');
  expect(detail).toContain('pension transactions');
  expect(detail).toContain('Gateway timeout');
});

import { describe, expect, test } from 'bun:test';
import type { Context } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { CurrencyRatesUnavailableError } from '../lib/currencyRateCache';
import { errorHandler } from './errorHandler';

function createTestContext(): Context {
  return {
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  } as Context;
}

describe('errorHandler', () => {
  test('maps unavailable currency rates to a 503 response', async () => {
    const response = await errorHandler(
      new CurrencyRatesUnavailableError('Missing FX rates for: GBP'),
      createTestContext(),
    );

    expect(response.status).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
    expect(await response.json()).toEqual({ error: 'Missing FX rates for: GBP' });
  });

  test('maps a value the database refuses to a 400 without repeating the query', async () => {
    const driverError = Object.assign(new Error('numeric field overflow'), { code: '22003' });
    const wrapped = Object.assign(new Error('Failed query: insert into "x" params: 1e+21'), {
      cause: driverError,
    });
    const response = await errorHandler(wrapped, createTestContext());

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(await response.json()).toEqual({ error: 'A value in the request cannot be stored' });
  });

  test('keeps other database failures as a fixed 500', async () => {
    const wrapped = Object.assign(new Error('Failed query: select 1'), {
      cause: Object.assign(new Error('connection lost'), { code: '08006' }),
    });
    const response = await errorHandler(wrapped, createTestContext());

    expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});

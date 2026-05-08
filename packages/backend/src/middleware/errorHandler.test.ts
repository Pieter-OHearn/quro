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
});

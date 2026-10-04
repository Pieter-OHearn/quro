import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';

import {
  BUNQ_PAYMENT_PAGE_CAP,
  exchangeCodeForTokens,
  createSession,
  fetchMonetaryAccounts,
  fetchPayments,
  generateKeyPair,
} from './bunqClient';
import { withWorkDeadline } from './workDeadline';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe('bunqClient', () => {
  test('fetchMonetaryAccounts parses account payloads', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        jsonResponse({
          Response: [
            {
              MonetaryAccountBank: {
                id: 7,
                description: 'Main account',
                balance: { value: '12.34', currency: 'EUR' },
                alias: [{ type: 'IBAN', value: 'NL00BUNQ0000000000' }],
                status: 'ACTIVE',
              },
            },
            {
              MonetaryAccountJoint: {
                id: 8,
                description: 'Joint account',
                balance: { value: '56.78', currency: 'EUR' },
                alias: [{ type: 'IBAN', value: 'NL00BUNQ1111111111' }],
                status: 'ACTIVE',
              },
            },
          ],
        }),
      ),
    );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchMonetaryAccounts('session-token', '42');

    expect(result).toEqual([
      {
        id: 7,
        type: 'BANK',
        description: 'Main account',
        balance: { value: '12.34', currency: 'EUR' },
        iban: 'NL00BUNQ0000000000',
        status: 'ACTIVE',
      },
      {
        id: 8,
        type: 'JOINT',
        description: 'Joint account',
        balance: { value: '56.78', currency: 'EUR' },
        iban: 'NL00BUNQ1111111111',
        status: 'ACTIVE',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('exchangeCodeForTokens surfaces oauth error_description failures', async () => {
    const { exchangeCodeForTokens } = await import('./bunqClient');
    globalThis.fetch = mock(() =>
      Promise.resolve(
        jsonResponse(
          { error: 'invalid_grant', error_description: 'authorization code expired' },
          { status: 400 },
        ),
      ),
    ) as unknown as typeof fetch;

    await expect(exchangeCodeForTokens('expired-code')).rejects.toThrow(
      'authorization code expired',
    );
  });

  test('createSession sends a Bunq client request id header', async () => {
    const fetchMock = mock((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        jsonResponse({
          Response: [
            { Id: { id: 123 } },
            { Token: { id: 123, token: 'session-token' } },
            { UserPerson: { id: 42 } },
          ],
        }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const privateKey = generateKeyPair().privateKey;

    const result = await createSession('installation-token', 'access-token', privateKey);

    expect(result.sessionId).toBe(123);
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('X-Bunq-Client-Request-Id')).toBeTruthy();
  });

  test('fetchPayments uses count pagination and filters client-side by created time', async () => {
    const fetchMock = mock((url: string | URL | Request) => {
      const urlString = String(url);
      if (urlString.includes('older_id=8')) {
        return Promise.resolve(
          jsonResponse({
            Response: [
              {
                Payment: {
                  id: 7,
                  amount: { value: '-2.00', currency: 'EUR' },
                  created: '2026-01-01 12:00:00.000000',
                  description: 'Older',
                  counterparty_alias: { display_name: 'Shop' },
                },
              },
              { Pagination: { older_url: null } },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          Response: [
            {
              Payment: {
                id: 9,
                amount: { value: '-1.00', currency: 'EUR' },
                created: '2026-01-03 12:00:00.000000',
                description: 'New',
                counterparty_alias: { display_name: 'Shop' },
              },
            },
            {
              Pagination: {
                older_url: '/v1/user/42/monetary-account/7/payment?count=200&older_id=8',
              },
            },
          ],
        }),
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const payments = await fetchPayments('session-token', '42', 7, '2026-01-02T00:00:00.000Z');

    expect(payments.map((payment) => payment.id)).toEqual([9]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('count=200');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('newer_than');
  });
});

test('bunq OAuth request aborts a hung socket at its request timeout', async () => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(10));
  let aborted = false;
  globalThis.fetch = mock(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(init.signal?.reason);
          },
          { once: true },
        );
      }),
  ) as unknown as typeof fetch;
  await expect(exchangeCodeForTokens('synthetic')).rejects.toThrow();
  expect(aborted).toBe(true);
});

test('bunq deadline bounds a hanging response body', async () => {
  let cancelled = false;
  globalThis.fetch = mock((_url: unknown, init?: RequestInit) => {
    const stream = new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener(
          'abort',
          () => {
            cancelled = true;
            controller.error(init.signal?.reason);
          },
          { once: true },
        );
      },
    });
    return Promise.resolve(new Response(stream));
  }) as unknown as typeof fetch;
  await expect(
    withWorkDeadline(10, () => fetchMonetaryAccounts('synthetic', '42')),
  ).rejects.toThrow();
  expect(cancelled).toBe(true);
});

test('bunq paging fails closed at the cap instead of returning partial history', async () => {
  const fetchMock = mock(() =>
    Promise.resolve(
      jsonResponse({
        Response: [{ Pagination: { older_url: '/user/42/payment?older_id=1' } }],
      }),
    ),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await expect(fetchPayments('synthetic', '42', 7)).rejects.toThrow('page cap exceeded');
  expect(fetchMock).toHaveBeenCalledTimes(BUNQ_PAYMENT_PAGE_CAP);
});

test('bunq rate limit backoff stops at the job deadline without a retry', async () => {
  const fetchMock = mock(() => Promise.resolve(jsonResponse({}, { status: 429 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await expect(
    withWorkDeadline(10, () => fetchMonetaryAccounts('synthetic', '42')),
  ).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

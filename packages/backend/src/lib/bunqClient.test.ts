import { afterEach, describe, expect, mock, test } from 'bun:test';

import { createSession, fetchMonetaryAccounts, fetchPayments, generateKeyPair } from './bunqClient';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
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

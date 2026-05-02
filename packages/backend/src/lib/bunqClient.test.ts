import { afterEach, describe, expect, mock, test } from 'bun:test';

import { fetchMonetaryAccounts } from './bunqClient';

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
});

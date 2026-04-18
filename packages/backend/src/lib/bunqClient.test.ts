import { afterEach, describe, expect, mock, test } from 'bun:test';

import { fetchMonetaryAccounts, type BunqTokens } from './bunqClient';

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
  test('fetchMonetaryAccounts resolves the user ID and parses account payloads', async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/user')) {
        return Promise.resolve(jsonResponse({ Response: [{ UserPerson: { id: 42 } }] }));
      }
      if (url.endsWith('/user/42/monetary-account')) {
        return Promise.resolve(
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
        );
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tokens: BunqTokens = { accessToken: 'access-token' };
    const result = await fetchMonetaryAccounts(tokens);

    expect(result.tokens).toEqual(tokens);
    expect(result.data).toEqual([
      {
        id: 7,
        type: 'BANK',
        description: 'Main account',
        balance: { value: '12.34', currency: 'EUR' },
        iban: 'NL00BUNQ0000000000',
        status: 'ACTIVE',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

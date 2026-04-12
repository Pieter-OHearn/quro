import { afterEach, describe, expect, mock, test } from 'bun:test';

import { fetchMonetaryAccounts, refreshAccessToken, type BunqTokens } from './bunqClient';

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
  test('fetchMonetaryAccounts returns refreshed tokens so callers can persist rotation', async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/token')) {
        return Promise.resolve(
          jsonResponse({
            access_token: 'fresh-access',
            refresh_token: 'fresh-refresh',
            expires_in: 3600,
          }),
        );
      }
      if (url.endsWith('/user')) {
        return Promise.resolve(
          jsonResponse({
            Response: [{ UserPerson: { id: 42 } }],
          }),
        );
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

    const expiringTokens: BunqTokens = {
      accessToken: 'stale-access',
      refreshToken: 'stale-refresh',
      tokenExpiresAt: new Date(Date.now() + 60_000),
    };

    const result = await fetchMonetaryAccounts(expiringTokens);

    expect(result.tokens.accessToken).toBe('fresh-access');
    expect(result.tokens.refreshToken).toBe('fresh-refresh');
    expect(result.tokens.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('refreshAccessToken surfaces oauth error_description failures', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: 'invalid_grant',
            error_description: 'refresh token expired',
          },
          { status: 400 },
        ),
      ),
    ) as unknown as typeof fetch;

    await expect(refreshAccessToken('expired-refresh')).rejects.toThrow('refresh token expired');
  });
});

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  MAX_RETIREMENT_AGE,
  MAX_USER_AGE,
  MIN_PASSWORD_LENGTH,
  MIN_RETIREMENT_AGE,
  MIN_USER_AGE,
} from '@quro/shared';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { createIntegrationHelpers, integrationPassword } from '../test/integration';

const integration = createIntegrationHelpers('settings.integration.quro.test');

type ApiDataResponse<T> = { data: T };
type ApiErrorResponse = { error: string };
type PublicUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  location: string;
  age: number;
  retirementAge: number;
  baseCurrency: string;
  jurisdiction: string;
  numberFormat: string;
  passwordUpdatedAt: string | null;
};

const changedPassword = 'new-strong-pass-456';

function getSessionId(cookie: string) {
  return cookie.match(/(?:^|;\s*)session=([^;]+)/)?.[1] ?? null;
}

async function parseJson<T>(response: Response, expectedStatus: number): Promise<T> {
  expect(response.status).toBe(expectedStatus);
  return (await response.json()) as T;
}

beforeAll(async () => {
  await integration.cleanup();
});

afterAll(async () => {
  await integration.cleanup();
});

describe('settings integration', () => {
  test('returns the authenticated user profile', async () => {
    const owner = await integration.signUp('get-profile', {
      firstName: 'Settings',
      lastName: 'Reader',
      age: 42,
      retirementAge: 68,
    });

    const response = await integration.request('/api/settings', {
      cookie: owner.cookie,
    });

    const body = await parseJson<ApiDataResponse<PublicUser>>(response, 200);
    expect(body.data).toMatchObject({
      id: owner.user.id,
      firstName: 'Settings',
      lastName: 'Reader',
      email: owner.user.email,
      location: '',
      age: 42,
      retirementAge: 68,
      baseCurrency: 'EUR',
      jurisdiction: 'GENERIC',
      numberFormat: 'en-US',
    });
    expect(body.data.passwordUpdatedAt).toBeNull();
  });

  test('rejects unauthenticated settings profile requests', async () => {
    const response = await integration.request('/api/settings');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });

  test('updates profile fields and normalizes strings', async () => {
    const owner = await integration.signUp('profile-update');

    const response = await integration.request('/api/settings/profile', {
      method: 'PUT',
      cookie: owner.cookie,
      json: {
        firstName: '  Updated  ',
        lastName: '  Person  ',
        email: owner.user.email.toUpperCase(),
        location: '  Amsterdam  ',
        age: '44',
        retirementAge: '69',
      },
    });

    const body = await parseJson<ApiDataResponse<PublicUser>>(response, 200);
    expect(body.data).toMatchObject({
      id: owner.user.id,
      firstName: 'Updated',
      lastName: 'Person',
      email: owner.user.email,
      location: 'Amsterdam',
      age: 44,
      retirementAge: 69,
    });
  });

  test('rejects invalid profile updates', async () => {
    const owner = await integration.signUp('profile-invalid');
    const validPayload = {
      firstName: 'Valid',
      lastName: 'Profile',
      email: owner.user.email,
      location: 'Amsterdam',
      age: 40,
      retirementAge: 67,
    };

    const cases: Array<{
      payload: Record<string, unknown>;
      expectedError: string;
    }> = [
      {
        payload: { ...validPayload, firstName: '' },
        expectedError: 'First name is required',
      },
      {
        payload: { ...validPayload, email: 'not-an-email' },
        expectedError: 'Enter a valid email address',
      },
      {
        payload: { ...validPayload, age: MIN_USER_AGE - 1 },
        expectedError: `Age must be between ${MIN_USER_AGE} and ${MAX_USER_AGE}`,
      },
      {
        payload: { ...validPayload, age: 40, retirementAge: 40 },
        expectedError: `Retirement age must be between 41 and ${MAX_RETIREMENT_AGE}`,
      },
      {
        payload: {
          ...validPayload,
          age: MIN_USER_AGE,
          retirementAge: MIN_RETIREMENT_AGE - 1,
        },
        expectedError: `Retirement age must be between ${MIN_RETIREMENT_AGE} and ${MAX_RETIREMENT_AGE}`,
      },
    ];

    for (const { payload, expectedError } of cases) {
      const response = await integration.request('/api/settings/profile', {
        method: 'PUT',
        cookie: owner.cookie,
        json: payload,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: expectedError });
    }
  });

  test('rejects a profile email already used by another user', async () => {
    const owner = await integration.signUp('profile-conflict-owner');
    const other = await integration.signUp('profile-conflict-other');

    const response = await integration.request('/api/settings/profile', {
      method: 'PUT',
      cookie: owner.cookie,
      json: {
        firstName: 'Conflict',
        lastName: 'Owner',
        email: other.user.email,
        location: 'Amsterdam',
        age: 41,
        retirementAge: 67,
      },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'An account with this email already exists' });
  });

  test('updates preferences individually and together', async () => {
    const owner = await integration.signUp('preferences-update');

    const currencyResponse = await integration.request('/api/settings/preferences', {
      method: 'PUT',
      cookie: owner.cookie,
      json: {
        baseCurrency: 'GBP',
      },
    });
    const currencyBody = await parseJson<ApiDataResponse<PublicUser>>(currencyResponse, 200);
    expect(currencyBody.data).toMatchObject({
      baseCurrency: 'GBP',
      jurisdiction: 'GENERIC',
      numberFormat: 'en-US',
    });

    const numberFormatResponse = await integration.request('/api/settings/preferences', {
      method: 'PUT',
      cookie: owner.cookie,
      json: {
        numberFormat: 'de-DE',
      },
    });
    const numberFormatBody = await parseJson<ApiDataResponse<PublicUser>>(
      numberFormatResponse,
      200,
    );
    expect(numberFormatBody.data).toMatchObject({
      baseCurrency: 'GBP',
      numberFormat: 'de-DE',
    });

    const bothResponse = await integration.request('/api/settings/preferences', {
      method: 'PUT',
      cookie: owner.cookie,
      json: {
        baseCurrency: 'USD',
        jurisdiction: 'NL',
        numberFormat: 'en-US',
      },
    });
    const bothBody = await parseJson<ApiDataResponse<PublicUser>>(bothResponse, 200);
    expect(bothBody.data).toMatchObject({
      baseCurrency: 'USD',
      jurisdiction: 'NL',
      numberFormat: 'en-US',
    });
  });

  test('rejects invalid preference updates', async () => {
    const owner = await integration.signUp('preferences-invalid');

    const cases: Array<{
      payload: Record<string, unknown>;
      expectedError: string;
    }> = [
      {
        payload: {},
        expectedError: 'Choose at least one preference to update',
      },
      {
        payload: { baseCurrency: 'BTC' },
        expectedError: 'Choose a valid base currency',
      },
      {
        payload: { numberFormat: 'fr-FR' },
        expectedError: 'Choose a valid number format',
      },
      {
        payload: { jurisdiction: 'BE' },
        expectedError: 'Choose a valid jurisdiction',
      },
    ];

    for (const { payload, expectedError } of cases) {
      const response = await integration.request('/api/settings/preferences', {
        method: 'PUT',
        cookie: owner.cookie,
        json: payload,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: expectedError });
    }
  });

  test("changes password and deletes other sessions while preserving the caller's session", async () => {
    const owner = await integration.signUp('password-update');
    const otherSession = await integration.signIn(owner.user.email);
    const callerSessionId = getSessionId(owner.cookie);
    const otherSessionId = getSessionId(otherSession.cookie);

    if (!callerSessionId || !otherSessionId) {
      throw new Error('Expected both authenticated sessions to have session cookies');
    }

    const response = await integration.request('/api/settings/password', {
      method: 'PUT',
      cookie: owner.cookie,
      json: {
        currentPassword: integrationPassword,
        nextPassword: changedPassword,
      },
    });
    const body = await parseJson<ApiDataResponse<PublicUser>>(response, 200);
    expect(body.data.passwordUpdatedAt).toBeTruthy();

    const remainingSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, owner.user.id));
    expect(remainingSessions).toEqual([{ id: callerSessionId }]);

    const callerMeResponse = await integration.request('/api/auth/me', {
      cookie: owner.cookie,
    });
    const callerMeBody = await parseJson<ApiDataResponse<PublicUser | null>>(callerMeResponse, 200);
    expect(callerMeBody.data?.id).toBe(owner.user.id);

    const otherMeResponse = await integration.request('/api/auth/me', {
      cookie: otherSession.cookie,
    });
    expect(await parseJson<ApiDataResponse<null>>(otherMeResponse, 200)).toEqual({ data: null });

    const oldPasswordResponse = await integration.request('/api/auth/signin', {
      method: 'POST',
      json: {
        email: owner.user.email,
        password: integrationPassword,
      },
    });
    expect(oldPasswordResponse.status).toBe(401);

    const newPasswordSession = await integration.signIn(owner.user.email, changedPassword);
    expect(newPasswordSession.user.id).toBe(owner.user.id);
  });

  test('rejects invalid password changes', async () => {
    const owner = await integration.signUp('password-invalid');

    const cases: Array<{
      payload: Record<string, unknown>;
      expectedStatus: number;
      expectedError: string;
    }> = [
      {
        payload: {
          currentPassword: 'wrong-current-password',
          nextPassword: 'valid-next-password',
        },
        expectedStatus: 401,
        expectedError: 'Current password is incorrect',
      },
      {
        payload: {
          currentPassword: integrationPassword,
          nextPassword: integrationPassword,
        },
        expectedStatus: 400,
        expectedError: 'New password must be different from your current password',
      },
      {
        payload: {
          currentPassword: integrationPassword,
          nextPassword: 'x'.repeat(MIN_PASSWORD_LENGTH - 1),
        },
        expectedStatus: 400,
        expectedError: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      },
    ];

    for (const { payload, expectedStatus, expectedError } of cases) {
      const response = await integration.request('/api/settings/password', {
        method: 'PUT',
        cookie: owner.cookie,
        json: payload,
      });

      expect(response.status).toBe(expectedStatus);
      expect(await response.json()).toEqual({ error: expectedError } satisfies ApiErrorResponse);
    }
  });

  test('rate limits password change attempts', async () => {
    const owner = await integration.signUp('password-rate-limit');
    const previousNodeEnv = process.env.NODE_ENV;
    const isolatedIp = `settings-rate-limit-${crypto.randomUUID()}`;

    try {
      process.env.NODE_ENV = 'development';

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await integration.request('/api/settings/password', {
          method: 'PUT',
          cookie: owner.cookie,
          headers: {
            'x-real-ip': isolatedIp,
          },
          json: {
            currentPassword: 'wrong-current-password',
            nextPassword: 'valid-next-password',
          },
        });

        expect(response.status).toBe(401);
      }

      const limitedResponse = await integration.request('/api/settings/password', {
        method: 'PUT',
        cookie: owner.cookie,
        headers: {
          'x-real-ip': isolatedIp,
        },
        json: {
          currentPassword: 'wrong-current-password',
          nextPassword: 'valid-next-password',
        },
      });

      expect(limitedResponse.status).toBe(429);
      expect(await limitedResponse.json()).toEqual({
        error: 'Too many requests, please try again later',
      });
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }

    const sessionRows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, owner.user.id), ne(sessions.id, '')));
    expect(sessionRows).toHaveLength(1);
  });
});

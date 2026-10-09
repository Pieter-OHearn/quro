import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { RegistrationPolicy, UserSession } from '@quro/shared';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { hashSessionToken } from '../lib/sessions';
import { createIntegrationHelpers, integrationPassword } from '../test/integration';

const integration = createIntegrationHelpers('auth-access.integration.quro.test');
const originalMode = process.env.REGISTRATION_MODE;

function setRegistrationMode(mode: string | undefined) {
  if (mode === undefined) delete process.env.REGISTRATION_MODE;
  else process.env.REGISTRATION_MODE = mode;
}

function signUp(label: string, inviteCode?: string) {
  return integration.request('/api/auth/signup', {
    method: 'POST',
    json: {
      firstName: 'Access',
      lastName: label,
      email: integration.buildEmail(label),
      password: integrationPassword,
      age: 30,
      retirementAge: 67,
      ...(inviteCode === undefined ? {} : { inviteCode }),
    },
  });
}

function json(response: Response): Promise<unknown> {
  return response.json();
}

async function typedJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function sessionTokenOf(cookie: string) {
  return cookie.match(/(?:^|;\s*)session=([^;]+)/)?.[1] ?? '';
}

beforeAll(async () => {
  await integration.cleanup();
  // The policy endpoint reports setup until some account exists.
  await integration.signUp('existing-owner');
});

afterEach(() => setRegistrationMode(originalMode));

afterAll(async () => {
  setRegistrationMode(originalMode);
  await integration.cleanup();
});

describe('registration policy', () => {
  test('is public and follows REGISTRATION_MODE once an account exists', async () => {
    const expected: Record<string, RegistrationPolicy['signUp']> = {
      invite: 'code',
      closed: 'closed',
      open: 'open',
    };
    for (const [mode, signUpRule] of Object.entries(expected)) {
      setRegistrationMode(mode);
      const response = await integration.request('/api/auth/registration');
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({
        data: { signUp: signUpRule, setupRequired: false },
      });
    }
  });

  test('invite-only is the default: no code, a wrong code and a valid code', async () => {
    setRegistrationMode(undefined);
    const missing = await signUp('no-code');
    expect(missing.status).toBe(403);
    expect(await json(missing)).toEqual({
      error: 'An invite code from the operator of this Quro instance is required',
    });

    const wrong = await signUp('wrong-code', 'AAAAA-BBBBB-CCCCC-DDDDD');
    expect(wrong.status).toBe(403);
    expect(await json(wrong)).toEqual({ error: 'This code is invalid, expired or already used' });

    expect((await signUp('valid-code', await integration.issueInviteCode())).status).toBe(201);
  });

  test('an invalid code does not reveal whether an email is registered', async () => {
    const owner = await integration.signUp('enumeration-target');
    const response = await integration.request('/api/auth/signup', {
      method: 'POST',
      json: {
        firstName: 'Probe',
        lastName: 'Probe',
        email: owner.user.email,
        password: integrationPassword,
        age: 30,
        retirementAge: 67,
      },
    });
    expect(response.status).toBe(403);
    expect(JSON.stringify(await json(response))).not.toContain('already exists');
  });

  test('closed mode refuses even a valid code and leaves it unused', async () => {
    setRegistrationMode('closed');
    const code = await integration.issueInviteCode();
    const response = await signUp('closed', code);
    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({
      error: 'Registration is closed on this Quro instance. Ask its operator for an account.',
    });

    setRegistrationMode('invite');
    expect((await signUp('after-closed', code)).status).toBe(201);
  });

  test('open mode is an explicit opt-in that needs no code', async () => {
    setRegistrationMode('open');
    expect((await signUp('open')).status).toBe(201);
  });
});

describe('public auth endpoints accept JSON only', () => {
  test('cross-site form posts cannot sign in, sign up or redeem a code', async () => {
    for (const path of ['/api/auth/signin', '/api/auth/signup', '/api/auth/password-reset']) {
      for (const contentType of [
        'application/x-www-form-urlencoded',
        'multipart/form-data; boundary=x',
        'text/plain',
      ]) {
        const response = await integration.request(path, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: 'email=a%40b.test&password=x',
        });
        expect(response.status).toBe(415);
      }
      const missing = await integration.request(path, { method: 'POST', body: '{}' });
      expect(missing.status).toBe(415);
    }
  });

  test('signing out still works without a body', async () => {
    const owner = await integration.signUp('bodyless-signout');
    const response = await integration.request('/api/auth/signout', {
      method: 'POST',
      cookie: owner.cookie,
    });
    expect(response.status).toBe(200);
    expect((await integration.request('/api/goals', { cookie: owner.cookie })).status).toBe(401);
  });
});

describe('password reset codes', () => {
  test('rejects missing, malformed and unknown codes and weak passwords', async () => {
    const cases = [
      [{ nextPassword: 'long-enough-1' }, 400, 'Recovery code is required'],
      [{ code: 'ABCDE', nextPassword: 'short' }, 400, undefined],
      [
        { code: 'AAAAA-BBBBB-CCCCC-DDDDD', nextPassword: 'long-enough-1' },
        400,
        'This recovery code is invalid, expired or already used',
      ],
    ] as const;
    for (const [body, status, error] of cases) {
      const response = await integration.request('/api/auth/password-reset', {
        method: 'POST',
        json: body,
      });
      expect(response.status).toBe(status);
      const payload = await typedJson<{ error: string }>(response);
      if (error) expect(payload.error).toBe(error);
    }
  });

  test('a registration code cannot reset a password', async () => {
    const code = await integration.issueInviteCode();
    const response = await integration.request('/api/auth/password-reset', {
      method: 'POST',
      json: { code, nextPassword: 'long-enough-1' },
    });
    expect(response.status).toBe(400);
  });
});

describe('session management', () => {
  test('stores only the digest of the cookie token', async () => {
    const owner = await integration.signUp('digest-only');
    const token = sessionTokenOf(owner.cookie);
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, owner.user.id));
    expect(rows).toEqual([{ id: hashSessionToken(token) }]);
    expect(rows[0]?.id).not.toBe(token);
  });

  test('a stored session id used as a cookie does not authenticate', async () => {
    const owner = await integration.signUp('digest-as-cookie');
    const digest = hashSessionToken(sessionTokenOf(owner.cookie));
    const response = await integration.request('/api/goals', { cookie: `session=${digest}` });
    expect(response.status).toBe(401);
  });

  test('lists the account sessions, newest use first, marking the current one', async () => {
    const owner = await integration.signUp('listing', {});
    const laptop = await integration.signIn(owner.user.email);
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(sessions.id, hashSessionToken(sessionTokenOf(owner.cookie))));

    const response = await integration.request('/api/settings/sessions', {
      cookie: laptop.cookie,
      headers: { 'User-Agent': 'ignored on reads' },
    });
    const { data } = await typedJson<{ data: UserSession[] }>(response);
    expect(data).toHaveLength(2);
    expect(data.map((session) => session.current)).toEqual([true, false]);
    expect(data[0]?.id).toBe(hashSessionToken(sessionTokenOf(laptop.cookie)));
  });

  test('records the browser user agent, truncated', async () => {
    const owner = await integration.signUp('user-agent');
    const response = await integration.request('/api/auth/signin', {
      method: 'POST',
      json: { email: owner.user.email, password: integrationPassword },
      headers: { 'User-Agent': `Synthetic/1.0 ${'x'.repeat(400)}` },
    });
    const cookie = response.headers.get('set-cookie') ?? '';
    const [row] = await db
      .select({ userAgent: sessions.userAgent })
      .from(sessions)
      .where(eq(sessions.id, hashSessionToken(sessionTokenOf(cookie))));
    expect(row?.userAgent).toStartWith('Synthetic/1.0 ');
    expect(row?.userAgent).toHaveLength(256);
  });

  test('revokes one other session, or every other session, but never the current one', async () => {
    const owner = await integration.signUp('revoking');
    const phone = await integration.signIn(owner.user.email);
    const tablet = await integration.signIn(owner.user.email);
    const phoneId = hashSessionToken(sessionTokenOf(phone.cookie));

    const one = await integration.request(`/api/settings/sessions/${phoneId}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    expect(one.status).toBe(200);
    expect((await integration.request('/api/goals', { cookie: phone.cookie })).status).toBe(401);

    const rest = await integration.request('/api/settings/sessions', {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    expect(await json(rest)).toEqual({ data: { revoked: 1 } });
    expect((await integration.request('/api/goals', { cookie: tablet.cookie })).status).toBe(401);
    expect((await integration.request('/api/goals', { cookie: owner.cookie })).status).toBe(200);
  });

  test('cannot see or revoke another account session', async () => {
    const owner = await integration.signUp('session-owner');
    const intruder = await integration.signUp('session-intruder');
    const ownerId = hashSessionToken(sessionTokenOf(owner.cookie));

    const listed = await typedJson<{ data: UserSession[] }>(
      await integration.request('/api/settings/sessions', { cookie: intruder.cookie }),
    );
    expect(listed.data.map((session) => session.id)).not.toContain(ownerId);

    const response = await integration.request(`/api/settings/sessions/${ownerId}`, {
      method: 'DELETE',
      cookie: intruder.cookie,
    });
    expect(response.status).toBe(404);
    expect((await integration.request('/api/goals', { cookie: owner.cookie })).status).toBe(200);
  });

  test('session management needs a signed-in session and a CSRF token', async () => {
    expect((await integration.request('/api/settings/sessions')).status).toBe(401);
    const owner = await integration.signUp('session-csrf');
    const response = await integration.request('/api/settings/sessions', {
      method: 'DELETE',
      headers: { Cookie: owner.cookie },
    });
    expect(response.status).toBe(403);
  });
});

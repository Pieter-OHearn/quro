import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import type { PublicAuthPolicy, SingleSignOnLink } from '@quro/shared';
import { db } from '../db/client';
import { authCodes, oidcIdentities, oidcLoginAttempts, sessions, users } from '../db/schema';
import { issuePasswordResetCode } from '../lib/authCodes';
import {
  FRESH_SIGN_IN_REQUIRED_MESSAGE,
  PASSWORD_LOGIN_OFF_MESSAGE,
  PASSWORD_LOGIN_OFF_UNLINK_MESSAGE,
} from '../lib/passwordLogin';
import { NO_PASSWORD_HASH } from '../lib/passwords';
import { resetOidcDiscovery } from '../lib/oidcClient';
import { createAccountWithoutPassword } from '../lib/registration';
import { applyTestSettings } from '../test/config';
import { createIntegrationHelpers, integrationPassword } from '../test/integration';
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_REDIRECT_URI,
  startFakeProvider,
  type FakeProvider,
} from '../test/oidcProvider';

// The single sign-on only mode: QRO_PASSWORD_LOGIN=false turns off every path that sets or checks
// a password, keeps the stored hashes and the sessions, and leaves the provider as the way in.

const integration = createIntegrationHelpers('password-login.integration.quro.test');
let provider: FakeProvider;
let restoreProvider: () => void;
let restoreOff: (() => void) | undefined;

const PROVIDER_SETTINGS = (issuer: string) => ({
  OIDC_ISSUER: issuer,
  OIDC_CLIENT_ID: FAKE_CLIENT_ID,
  OIDC_CLIENT_SECRET: FAKE_CLIENT_SECRET,
  OIDC_REDIRECT_URI: FAKE_REDIRECT_URI,
  OIDC_PROVIDER_NAME: 'Authelia',
});

function passwordsOff() {
  restoreOff?.();
  restoreOff = applyTestSettings({ QRO_PASSWORD_LOGIN: 'false' });
}

function passwordsOn() {
  restoreOff?.();
  restoreOff = undefined;
}

beforeAll(async () => {
  await integration.cleanup();
  provider = await startFakeProvider();
  restoreProvider = applyTestSettings(PROVIDER_SETTINGS(provider.issuer));
});

afterEach(async () => {
  passwordsOn();
  resetOidcDiscovery();
  await db.delete(oidcLoginAttempts);
});

afterAll(async () => {
  restoreProvider();
  provider.stop();
  await integration.cleanup();
});

type Json = { error?: string; data?: unknown };

async function json(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

/** The browser's provider sign-in, start to finish; returns the callback's answer. */
async function signInThroughProvider(subject: string, email: string, emailVerified = true) {
  const begun = await integration.request('/api/auth/oidc/login');
  const location = new URL(begun.headers.get('location')!);
  const code = `code-${crypto.randomUUID()}`;
  provider.grant(code, {
    nonce: location.searchParams.get('nonce')!,
    challenge: location.searchParams.get('code_challenge')!,
    subject,
    email,
    emailVerified,
  });
  return integration.request(
    `/api/auth/oidc/callback?code=${code}&state=${location.searchParams.get('state')}`,
    { cookie: begun.headers.get('set-cookie')!.split(';')[0]! },
  );
}

function cookiesOf(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  return `session=${header.match(/session=([^;]+)/)![1]}; csrf_token=${header.match(/csrf_token=([^;]+)/)![1]}`;
}

async function passwordHashOf(userId: number) {
  const [row] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  return row!.hash;
}

describe('with password sign-in off', () => {
  test('the sign-in route refuses every request with the same fixed message and sets no session', async () => {
    const account = await integration.signUp('signin-refused');
    passwordsOff();
    const attempts = [
      { email: account.user.email, password: integrationPassword },
      { email: account.user.email, password: 'a wrong password' },
      { email: 'nobody@password-login.example', password: integrationPassword },
      {},
    ];
    for (const credentials of attempts) {
      const response = await integration.request('/api/auth/signin', {
        method: 'POST',
        json: credentials,
      });
      expect(response.status).toBe(403);
      expect(await json(response)).toEqual({ error: PASSWORD_LOGIN_OFF_MESSAGE });
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    const unreadable = await integration.request('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(unreadable.status).toBe(403);
  });

  test('sign-up is refused and neither the code nor an account is spent', async () => {
    const code = await integration.issueInviteCode();
    passwordsOff();
    const email = integration.buildEmail('signup-refused');
    const response = await integration.request('/api/auth/signup', {
      method: 'POST',
      json: {
        firstName: 'Refused',
        lastName: 'Signup',
        email,
        password: integrationPassword,
        age: 40,
        retirementAge: 67,
        inviteCode: code,
      },
    });
    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: PASSWORD_LOGIN_OFF_MESSAGE });
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);

    // The code is still good once passwords are back.
    passwordsOn();
    const later = await integration.signUp('signup-later', { inviteCode: code });
    expect(later.user.email).toContain('signup-later');
  });

  test('sign-up is refused in every registration mode, even open', async () => {
    const restoreOpen = applyTestSettings({ QRO_REGISTRATION_MODE: 'open' });
    try {
      passwordsOff();
      const response = await integration.request('/api/auth/signup', {
        method: 'POST',
        json: {
          firstName: 'Open',
          lastName: 'Mode',
          email: integration.buildEmail('open-refused'),
          password: integrationPassword,
        },
      });
      expect(response.status).toBe(403);
      expect(await json(response)).toEqual({ error: PASSWORD_LOGIN_OFF_MESSAGE });
    } finally {
      restoreOpen();
    }
  });

  test('a reset code cannot be redeemed, and stays valid for when passwords are back', async () => {
    const account = await integration.signUp('reset-refused');
    const before = await passwordHashOf(account.user.id);
    const issued = await issuePasswordResetCode(account.user.id);
    passwordsOff();
    const response = await integration.request('/api/auth/password-reset', {
      method: 'POST',
      json: { code: issued.code, nextPassword: 'a-brand-new-password-1' },
    });
    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: PASSWORD_LOGIN_OFF_MESSAGE });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await passwordHashOf(account.user.id)).toBe(before);
    const [row] = await db.select().from(authCodes).where(eq(authCodes.id, issued.id));
    expect(row!.consumedAt).toBeNull();
    // The old password is still the password.
    passwordsOn();
    expect((await integration.signIn(account.user.email)).user.id).toBe(account.user.id);
  });

  test('the password cannot be changed, and the signed-in session is unaffected', async () => {
    const account = await integration.signUp('change-refused');
    const before = await passwordHashOf(account.user.id);
    passwordsOff();
    const response = await integration.request('/api/settings/password', {
      method: 'PUT',
      cookie: account.cookie,
      json: { currentPassword: integrationPassword, nextPassword: 'another-password-12' },
    });
    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: PASSWORD_LOGIN_OFF_MESSAGE });
    expect(await passwordHashOf(account.user.id)).toBe(before);
    const me = await integration.request('/api/auth/me', { cookie: account.cookie });
    expect(((await json(me)).data as { id: number }).id).toBe(account.user.id);
  });

  test('sessions that exist when the setting changes stay valid, both ways', async () => {
    const account = await integration.signUp('sessions-stay');
    passwordsOff();
    const duringOff = await integration.request('/api/settings/sessions', {
      cookie: account.cookie,
    });
    expect(duringOff.status).toBe(200);
    passwordsOn();
    const afterOn = await integration.request('/api/settings/sessions', { cookie: account.cookie });
    expect(afterOn.status).toBe(200);
  });

  test('switching the setting back on restores password sign-in for accounts with a hash', async () => {
    const account = await integration.signUp('restored');
    passwordsOff();
    const refused = await integration.request('/api/auth/signin', {
      method: 'POST',
      json: { email: account.user.email, password: integrationPassword },
    });
    expect(refused.status).toBe(403);
    passwordsOn();
    const back = await integration.signIn(account.user.email);
    expect(back.user.id).toBe(account.user.id);
  });

  test('the public policy says passwords are off and that nobody signs up', async () => {
    const read = async () =>
      ((await json(await integration.request('/api/auth/registration'))).data ??
        null) as PublicAuthPolicy;
    expect(await read()).toMatchObject({ passwordLogin: true, singleSignOn: { name: 'Authelia' } });
    passwordsOff();
    const policy = await read();
    expect(policy).toMatchObject({
      passwordLogin: false,
      signUp: 'closed',
      singleSignOn: { name: 'Authelia' },
    });
    // No secret, address or setting value is in the answer.
    expect(JSON.stringify(policy)).not.toContain(provider.issuer);
    expect(JSON.stringify(policy)).not.toContain(FAKE_CLIENT_SECRET);
  });

  test('Settings tells the page whether passwords are off, and refuses to unlink', async () => {
    const account = await integration.signUp('unlink-off');
    expect((await signInThroughProvider('sub-unlink-off', account.user.email)).status).toBe(302);
    const [identity] = await db
      .select()
      .from(oidcIdentities)
      .where(eq(oidcIdentities.userId, account.user.id));
    expect(identity).toBeDefined();
    const cookie = cookiesOf(await signInThroughProvider('sub-unlink-off', account.user.email));
    passwordsOff();

    const link = await integration.request('/api/settings/single-sign-on', { cookie });
    expect((await json(link)).data as SingleSignOnLink).toEqual({
      linked: true,
      providerName: 'Authelia',
      passwordLogin: false,
    });

    for (const body of [{ password: integrationPassword }, {}]) {
      const response = await integration.request('/api/settings/single-sign-on', {
        method: 'DELETE',
        cookie,
        json: body,
      });
      expect(response.status).toBe(403);
      expect(await json(response)).toEqual({ error: PASSWORD_LOGIN_OFF_UNLINK_MESSAGE });
    }
    expect(
      await db.select().from(oidcIdentities).where(eq(oidcIdentities.userId, account.user.id)),
    ).toHaveLength(1);
  });

  test('deleting the account needs the address and a sign-in from the last ten minutes', async () => {
    const account = await integration.signUp('delete-off');
    const cookie = cookiesOf(await signInThroughProvider('sub-delete-off', account.user.email));
    const sessionId = cookie.match(/session=([^;]+)/)![1]!;
    passwordsOff();
    const remove = (body: unknown) =>
      integration.request('/api/settings/account', { method: 'DELETE', cookie, json: body });

    expect((await remove({})).status).toBe(400);
    const wrongAddress = await remove({ confirmEmail: 'someone-else@example.com' });
    expect(wrongAddress.status).toBe(400);

    // A session that is not fresh cannot delete, whatever else it sends.
    const { hashSessionToken } = await import('../lib/sessions');
    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(sessions.id, hashSessionToken(sessionId)));
    const stale = await remove({ confirmEmail: account.user.email, password: integrationPassword });
    expect(stale.status).toBe(403);
    expect(await json(stale)).toEqual({ error: FRESH_SIGN_IN_REQUIRED_MESSAGE });
    expect(await db.select().from(users).where(eq(users.id, account.user.id))).toHaveLength(1);

    // A fresh provider sign-in can. No password is asked for or checked.
    const fresh = cookiesOf(await signInThroughProvider('sub-delete-off', account.user.email));
    const deleted = await integration.request('/api/settings/account', {
      method: 'DELETE',
      cookie: fresh,
      json: { confirmEmail: account.user.email.toUpperCase() },
    });
    expect(deleted.status).toBe(200);
    expect(await db.select().from(users).where(eq(users.id, account.user.id))).toHaveLength(0);
  });

  test('with passwords on, deleting the account still needs the password', async () => {
    const account = await integration.signUp('delete-on');
    const noPassword = await integration.request('/api/settings/account', {
      method: 'DELETE',
      cookie: account.cookie,
      json: { confirmEmail: account.user.email },
    });
    expect(noPassword.status).toBe(400);
    const wrong = await integration.request('/api/settings/account', {
      method: 'DELETE',
      cookie: account.cookie,
      json: { confirmEmail: account.user.email, password: 'wrong password' },
    });
    expect(wrong.status).toBe(401);
  });
});

describe('an account created by the operator', () => {
  async function create(label: string) {
    const email = integration.buildEmail(label);
    const result = await createAccountWithoutPassword({
      firstName: label,
      lastName: '',
      email,
    });
    if (!result.ok) throw new Error('expected the account to be created');
    return { id: result.user.id, email };
  }

  test('has no password, so no password input signs it in, with passwords on or off', async () => {
    const account = await create('no-password');
    expect(await passwordHashOf(account.id)).toBe(NO_PASSWORD_HASH);
    const guesses = [
      integrationPassword,
      'quro-dummy-password',
      NO_PASSWORD_HASH,
      ' ',
      '0',
      'null',
      'undefined',
      '$2b$10$',
    ];
    for (const mode of [passwordsOn, passwordsOff]) {
      mode();
      for (const password of guesses) {
        const response = await integration.request('/api/auth/signin', {
          method: 'POST',
          json: { email: account.email, password },
        });
        expect([400, 401, 403]).toContain(response.status);
        expect(response.headers.get('set-cookie')).toBeNull();
      }
    }
    // With passwords on, it answers like any wrong password: nothing tells the account apart.
    passwordsOn();
    const wrong = await integration.request('/api/auth/signin', {
      method: 'POST',
      json: { email: account.email, password: 'wrong password' },
    });
    const unknown = await integration.request('/api/auth/signin', {
      method: 'POST',
      json: { email: 'nobody@password-login.example', password: 'wrong password' },
    });
    expect(wrong.status).toBe(401);
    expect(await json(wrong)).toEqual(await json(unknown));
  });

  test('is linked by the first provider sign-in, by verified email, and then signs in by subject', async () => {
    passwordsOff();
    const account = await create('first-link');
    const first = await signInThroughProvider('sub-first-link', account.email);
    expect(first.headers.get('location')).toBe('/');
    const me = await integration.request('/api/auth/me', { cookie: cookiesOf(first) });
    expect(((await json(me)).data as { id: number }).id).toBe(account.id);
    const again = await signInThroughProvider('sub-first-link', account.email);
    expect(again.headers.get('location')).toBe('/');
  });

  test('is not linked by an address the provider has not verified, or by another address', async () => {
    passwordsOff();
    const account = await create('unverified');
    const unverified = await signInThroughProvider('sub-unverified', account.email, false);
    expect(unverified.headers.get('location')).toBe('/welcome?sso=unverified_email');
    const other = await signInThroughProvider('sub-other', 'someone-else@example.com');
    expect(other.headers.get('location')).toBe('/welcome?sso=no_account');
    expect(
      await db.select().from(oidcIdentities).where(eq(oidcIdentities.userId, account.id)),
    ).toHaveLength(0);
  });

  test('links in open registration mode when passwords are off, because nobody can register', async () => {
    const restoreOpen = applyTestSettings({ QRO_REGISTRATION_MODE: 'open' });
    try {
      const account = await create('open-link');
      passwordsOn();
      const refused = await signInThroughProvider('sub-open-on', account.email);
      expect(refused.headers.get('location')).toBe('/welcome?sso=no_account');
      passwordsOff();
      const linked = await signInThroughProvider('sub-open-off', account.email);
      expect(linked.headers.get('location')).toBe('/');
    } finally {
      restoreOpen();
    }
  });

  test('a provider sign-in creates no account', async () => {
    passwordsOff();
    const countBefore = (await db.select({ id: users.id }).from(users)).length;
    const response = await signInThroughProvider('sub-stranger', 'stranger@example.com');
    expect(response.headers.get('location')).toBe('/welcome?sso=no_account');
    expect((await db.select({ id: users.id }).from(users)).length).toBe(countBefore);
  });

  test('refuses an address that is taken, whatever its case', async () => {
    const account = await create('taken');
    const again = await createAccountWithoutPassword({
      firstName: 'Taken',
      lastName: '',
      email: account.email,
    });
    expect(again).toEqual({ ok: false, reason: 'email_taken' });
  });

  test('can get a password with an operator reset code once passwords are on', async () => {
    const account = await create('reset-later');
    const issued = await issuePasswordResetCode(account.id);
    const reset = await integration.request('/api/auth/password-reset', {
      method: 'POST',
      json: { code: issued.code, nextPassword: 'operator-chosen-pass-1' },
    });
    expect(reset.status).toBe(200);
    expect((await integration.signIn(account.email, 'operator-chosen-pass-1')).user.id).toBe(
      account.id,
    );
  });
});

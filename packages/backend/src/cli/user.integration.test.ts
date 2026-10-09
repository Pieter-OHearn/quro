import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { authCodes } from '../db/schema';
import { issuePasswordResetCode } from '../lib/authCodes';
import { createIntegrationHelpers, integrationPassword } from '../test/integration';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from './io';
import { runQuro } from './quro';

const integration = createIntegrationHelpers('operator-cli.integration.quro.test');
const CODE_PATTERN = /\b[0-9A-HJKMNP-TV-Z]{6}(?:-[0-9A-HJKMNP-TV-Z]{6}){3}\b/;
const NEW_PASSWORD = 'operator-reset-pass-789';

async function quro(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const exitCode = await runQuro(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { exitCode, out: out.join('\n'), err: err.join('\n') };
}

function issuedCode(output: string): string {
  const code = output.match(CODE_PATTERN)?.[0];
  if (!code) throw new Error(`No code in output: ${output}`);
  return code;
}

function signUpWith(label: string, inviteCode: string) {
  return integration.request('/api/auth/signup', {
    method: 'POST',
    json: {
      firstName: 'Cli',
      lastName: label,
      email: integration.buildEmail(label),
      password: integrationPassword,
      age: 40,
      retirementAge: 67,
      inviteCode,
    },
  });
}

beforeAll(async () => {
  await integration.cleanup();
});

afterAll(async () => {
  await integration.cleanup();
});

describe('quro user', () => {
  test('invite prints a single-use code that creates exactly one account', async () => {
    const result = await quro('user', 'invite', '--hours', '2');
    expect(result.exitCode).toBe(EXIT_OK);
    const code = issuedCode(result.out);

    expect((await signUpWith('invited', code)).status).toBe(201);
    const reused = await signUpWith('reused', code);
    expect(reused.status).toBe(403);
    expect(await reused.json()).toEqual({ error: 'This code is invalid, expired or already used' });
  });

  test('reset-password issues a code that sets a new password and ends every session', async () => {
    const owner = await integration.signUp('forgot-password');
    const otherBrowser = await integration.signIn(owner.user.email);

    const result = await quro('user', 'reset-password', owner.user.email.toUpperCase());
    expect(result.exitCode).toBe(EXIT_OK);
    const code = issuedCode(result.out);

    const reset = await integration.request('/api/auth/password-reset', {
      method: 'POST',
      json: { code: code.toLowerCase(), nextPassword: NEW_PASSWORD },
    });
    expect(reset.status).toBe(200);
    expect(reset.headers.get('set-cookie')).toContain('session=');

    for (const old of [owner, otherBrowser]) {
      const response = await integration.request('/api/goals', { cookie: old.cookie });
      expect(response.status).toBe(401);
    }
    await expect(integration.signIn(owner.user.email)).rejects.toThrow('Invalid email or password');
    expect((await integration.signIn(owner.user.email, NEW_PASSWORD)).user.id).toBe(owner.user.id);

    const replay = await integration.request('/api/auth/password-reset', {
      method: 'POST',
      json: { code, nextPassword: 'another-pass-012' },
    });
    expect(replay.status).toBe(400);
  });

  test('a newer reset code replaces the previous one', async () => {
    const owner = await integration.signUp('reset-replaced');
    const first = issuedCode((await quro('user', 'reset-password', owner.user.email)).out);
    const second = issuedCode((await quro('user', 'reset-password', owner.user.email)).out);

    const withFirst = await integration.request('/api/auth/password-reset', {
      method: 'POST',
      json: { code: first, nextPassword: NEW_PASSWORD },
    });
    expect(withFirst.status).toBe(400);
    const withSecond = await integration.request('/api/auth/password-reset', {
      method: 'POST',
      json: { code: second, nextPassword: NEW_PASSWORD },
    });
    expect(withSecond.status).toBe(200);
  });

  test('concurrent reset codes for one account leave exactly one usable code', async () => {
    const owner = await integration.signUp('reset-race');
    await Promise.all(Array.from({ length: 5 }, () => issuePasswordResetCode(owner.user.id)));
    const unused = await db
      .select({ id: authCodes.id })
      .from(authCodes)
      .where(and(eq(authCodes.userId, owner.user.id), isNull(authCodes.consumedAt)));
    expect(unused).toHaveLength(1);
  });

  test('revoke-sessions signs an account out of every browser', async () => {
    const owner = await integration.signUp('revoke-all');
    await integration.signIn(owner.user.email);

    const result = await quro('user', 'revoke-sessions', owner.user.email);
    expect(result).toMatchObject({ exitCode: EXIT_OK, out: expect.stringContaining('Revoked 2') });
    expect((await integration.request('/api/goals', { cookie: owner.cookie })).status).toBe(401);
  });

  test('unknown accounts fail without issuing anything', async () => {
    const email = integration.buildEmail('nobody');
    for (const command of ['reset-password', 'revoke-sessions']) {
      const result = await quro('user', command, email);
      expect(result.exitCode).toBe(EXIT_FAILURE);
      expect(result.err).toBe(`No account uses ${email}`);
      expect(result.out).toBe('');
    }
  });

  test('list and codes show account metadata and never a code value', async () => {
    const owner = await integration.signUp('listed');
    const invite = issuedCode((await quro('user', 'invite')).out);

    const users = await quro('user', 'list');
    expect(users.out).toMatch(
      new RegExp(`#${owner.user.id}  ${owner.user.email} .*active sessions: 1`),
    );

    const codes = await quro('user', 'codes');
    expect(codes.out).toContain('registration');
    expect(codes.out).toContain('unused, expires');
    expect(codes.out).not.toContain(invite);
    expect(codes.out).not.toMatch(CODE_PATTERN);
  });

  test('revoke-code withdraws an unused code', async () => {
    const result = await quro('user', 'invite');
    const code = issuedCode(result.out);
    const id = result.out.match(/Registration code #(\d+)/)?.[1];
    expect(id).toBeDefined();

    expect((await quro('user', 'revoke-code', id!)).out).toBe(`Code #${id} withdrawn.`);
    expect((await signUpWith('withdrawn', code)).status).toBe(403);
    expect((await quro('user', 'revoke-code', id!)).exitCode).toBe(EXIT_FAILURE);
  });

  test('status reports the registration mode and that setup is complete', async () => {
    await integration.signUp('status');
    const result = await quro('user', 'status');
    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.out).toContain('Registration mode: invite');
    expect(result.out).toContain('Sign-up currently: requires a code');
    expect(result.out).toContain('Setup: complete');
  });

  test('mistakes print usage and exit 2 without touching the database', async () => {
    const cases = [
      ['user'],
      ['user', 'bogus'],
      ['user', 'invite', '--hours', '0'],
      ['user', 'invite', '--hours'],
      ['user', 'invite', '--days', '2'],
      ['user', 'reset-password'],
      ['user', 'list', 'extra'],
      ['user', 'revoke-code', 'abc'],
    ];
    for (const args of cases) {
      const result = await quro(...args);
      expect(result.exitCode).toBe(EXIT_USAGE);
      expect(result.err).toContain('Usage: quro user <command>');
      expect(result.out).toBe('');
    }
    expect((await quro('nope')).err).toContain('Unknown command: nope');
    expect((await quro()).exitCode).toBe(EXIT_USAGE);
    expect((await quro('--help')).out).toContain('Usage: quro <command>');
    expect((await quro('user', '--help')).out).toContain('reset-password <email>');
  });
});

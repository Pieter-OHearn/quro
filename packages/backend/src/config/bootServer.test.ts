import { describe, expect, test } from 'bun:test';

// The server's first import validates the settings and exits with code 2 on a problem. These run
// that entry in a child process, with a minimal environment of its own.

const SECRET = 'boot-test-database-password';

async function boot(extra: Record<string, string>) {
  const child = Bun.spawn([process.execPath, 'src/config/bootServer.ts'], {
    cwd: new URL('../..', import.meta.url).pathname,
    env: {
      PATH: process.env.PATH ?? '',
      DATABASE_URL: `postgres://quro:${SECRET}@127.0.0.1:1/quro`,
      QRO_DOCUMENT_STORAGE: 'filesystem',
      ...extra,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: stdout + stderr };
}

const PROVIDER = {
  OIDC_ISSUER: 'https://auth.example.com',
  OIDC_CLIENT_ID: 'quro',
  OIDC_CLIENT_SECRET: 'boot-test-client-secret',
  OIDC_REDIRECT_URI: 'https://quro.example.com/api/auth/oidc/callback',
};

describe('server startup with QRO_PASSWORD_LOGIN', () => {
  test('refuses to start with passwords off and no provider, naming the setting and no value', async () => {
    const run = await boot({ QRO_PASSWORD_LOGIN: 'false' });
    expect(run.exitCode).toBe(2);
    expect(run.output).toContain('QRO_PASSWORD_LOGIN');
    expect(run.output).toContain('single sign-on');
    expect(run.output).not.toContain(SECRET);
  });

  test('starts with passwords on, with or without a provider, and with passwords off and a provider', async () => {
    expect((await boot({})).exitCode).toBe(0);
    expect((await boot({ QRO_PASSWORD_LOGIN: 'true', ...PROVIDER })).exitCode).toBe(0);
    const off = await boot({ QRO_PASSWORD_LOGIN: 'false', ...PROVIDER });
    expect(off.exitCode).toBe(0);
    expect(off.output).not.toContain('boot-test-client-secret');
  });

  test('refuses a value that is not a boolean', async () => {
    const run = await boot({ QRO_PASSWORD_LOGIN: 'off', ...PROVIDER });
    expect(run.exitCode).toBe(2);
    expect(run.output).toContain('QRO_PASSWORD_LOGIN');
  });
});

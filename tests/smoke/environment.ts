import { execFileSync } from 'node:child_process';

// Shared by playwright.config.ts and the smoke tests, so both read the same ports.

function readPort(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const port = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a TCP port between 1 and 65535`);
  }
  return port;
}

export const BACKEND_PORT = readPort('QRO_SMOKE_BACKEND_PORT', 3300);
export const FRONTEND_PORT = readPort('QRO_SMOKE_FRONTEND_PORT', 4273);
export const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;
export const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`;

// Registration is invite-only, so a smoke user signs up the way an invited user does: with a
// code from the operator command, run against the smoke database only. .env files are ignored
// and the role URLs default to DATABASE_URL, like the smoke backend in playwright.config.ts.
export function issueInviteCode(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const output = execFileSync(
    'bun',
    ['--no-env-file', 'packages/backend/src/cli/quro.ts', 'user', 'invite', '--hours', '1'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL || databaseUrl,
        APP_DATABASE_URL: process.env.APP_DATABASE_URL || databaseUrl,
      },
    },
  );
  const code = output.match(/[0-9A-HJKMNP-TV-Z]{6}(?:-[0-9A-HJKMNP-TV-Z]{6}){3}/)?.[0];
  if (!code) throw new Error('quro user invite printed no code');
  return code;
}

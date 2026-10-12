import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  BACKEND_ORIGIN,
  BACKEND_PORT,
  FRONTEND_ORIGIN,
  FRONTEND_PORT,
} from './tests/smoke/environment';

const isCI = Boolean(process.env.CI);
const useSystemChrome = !isCI && process.env.QRO_SMOKE_USE_SYSTEM_CHROME !== '0';

// The smoke backend migrates and seeds demo data, so it only runs against an explicit,
// throwaway database (see "DB-backed tests" in docs/development.md). The role URLs default
// to it so packages/backend/.env cannot redirect the migration or the seed.
const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Point it at a throwaway PostgreSQL; see "DB-backed tests" in docs/development.md.',
  );
}

// The smoke backend keeps documents in a fresh directory through the filesystem store. The
// runner creates it once; test workers load this file again and inherit the path, so the
// document smoke test can look inside it. global-teardown.ts removes it.
process.env.QRO_SMOKE_DOCUMENTS_DIR ||= mkdtempSync(join(tmpdir(), 'quro-smoke-documents-'));
const DOCUMENTS_DIR = process.env.QRO_SMOKE_DOCUMENTS_DIR;

export default defineConfig({
  testDir: './tests/smoke',
  testMatch: '**/*.e2e.ts',
  globalTeardown: './tests/smoke/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: FRONTEND_ORIGIN,
    channel: useSystemChrome ? 'chrome' : undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'bun run smoke:backend',
      url: `${BACKEND_ORIGIN}/api/health`,
      // Never reuse a backend already on this port: it would bypass the explicit DATABASE_URL and
      // QRO_DISABLE_SCHEDULERS below. Stop it and rerun instead.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        // No interval schedulers, so the smoke backend never calls bunq or a price provider.
        QRO_DISABLE_SCHEDULERS: 'true',
        DATABASE_URL,
        ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL || DATABASE_URL,
        APP_DATABASE_URL: process.env.APP_DATABASE_URL || DATABASE_URL,
        CORS_ORIGIN: FRONTEND_ORIGIN,
        QRO_DOCUMENT_STORAGE: 'filesystem',
        QRO_DOCUMENTS_DIR: DOCUMENTS_DIR,
      },
    },
    {
      command: `bun run smoke:frontend --port ${FRONTEND_PORT}`,
      url: `${FRONTEND_ORIGIN}/welcome`,
      // Never reuse a frontend already on this port either: it may point at another backend.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_URL: BACKEND_ORIGIN,
      },
    },
  ],
});

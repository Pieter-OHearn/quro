import { defineConfig, devices } from '@playwright/test';

const FRONTEND_ORIGIN = 'http://127.0.0.1:4273';
const BACKEND_ORIGIN = 'http://127.0.0.1:3300';
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

export default defineConfig({
  testDir: './tests/smoke',
  testMatch: '**/*.e2e.ts',
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
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: '3300',
        // No interval schedulers, so the smoke backend never calls bunq or a price provider.
        QRO_DISABLE_SCHEDULERS: 'true',
        DATABASE_URL,
        ADMIN_DATABASE_URL: process.env.ADMIN_DATABASE_URL || DATABASE_URL,
        APP_DATABASE_URL: process.env.APP_DATABASE_URL || DATABASE_URL,
        CORS_ORIGIN: FRONTEND_ORIGIN,
      },
    },
    {
      command: 'bun run smoke:frontend',
      url: `${FRONTEND_ORIGIN}/welcome`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_URL: BACKEND_ORIGIN,
      },
    },
  ],
});

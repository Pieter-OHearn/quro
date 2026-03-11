import { defineConfig, devices } from '@playwright/test';

const FRONTEND_ORIGIN = 'http://127.0.0.1:4273';
const BACKEND_ORIGIN = 'http://127.0.0.1:3300';
const DEFAULT_DATABASE_URL = 'postgres://quro:quro@127.0.0.1:5432/quro';
const isCI = Boolean(process.env.CI);
const useSystemChrome = !isCI && process.env.QRO_SMOKE_USE_SYSTEM_CHROME !== '0';

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
        DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
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

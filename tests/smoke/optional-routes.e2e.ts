import { expect, test } from '@playwright/test';
import { BACKEND_ORIGIN } from './environment';

// The demo seed's user (packages/backend/src/db/demoSeed.ts); DEMO_USER_PASSWORD overrides the
// default password there and here.
const DEMO_EMAIL = 'demo@quro.local';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'password123';

test('the demo user sees no 404s from routes of capabilities that are off', async ({ page }) => {
  const notFound: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() === 404) {
      notFound.push(`${response.request().method()} ${url.pathname}`);
    }
  });

  await page.goto('/welcome');
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();
  const signInDialog = page.getByRole('dialog');
  await signInDialog.getByTestId('signin-email-input').fill(DEMO_EMAIL);
  await signInDialog.getByTestId('signin-password-input').fill(DEMO_PASSWORD);
  await signInDialog.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();

  // The smoke backend runs with default settings: no pension import service and no bunq.
  const capabilities = await page.request.get(`${BACKEND_ORIGIN}/api/capabilities`);
  expect(capabilities.status()).toBe(200);
  const { data } = (await capabilities.json()) as {
    data: { bunq: { enabled: boolean }; pensionStatementImport: { reason: string | null } };
  };
  expect(data.bunq.enabled).toBe(false);
  expect(data.pensionStatementImport.reason).toBe('not_configured');

  await page.waitForLoadState('networkidle');
  for (const path of ['/savings', '/pension', '/settings?tab=connections']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  await expect(page.getByRole('heading', { name: 'Connected accounts' })).toBeVisible();
  expect(notFound).toEqual([]);
});

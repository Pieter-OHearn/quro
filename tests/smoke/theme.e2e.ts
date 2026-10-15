import { expect, test, type Page } from '@playwright/test';

// The demo seed's user (packages/backend/src/db/demoSeed.ts); DEMO_USER_PASSWORD overrides the
// default password there and here.
const DEMO_EMAIL = 'demo@quro.local';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'password123';
// The dark page ground, `--surface-sunken` in the `.dark` block of theme.css.
const DARK_GROUND = 'rgb(14, 20, 17)';

async function signInToDashboard(page: Page) {
  await page.goto('/welcome');
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();
  const signInDialog = page.getByRole('dialog');
  await signInDialog.getByTestId('signin-email-input').fill(DEMO_EMAIL);
  await signInDialog.getByTestId('signin-password-input').fill(DEMO_PASSWORD);
  await signInDialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();
}

test.describe('with the operating system in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('the dashboard follows the system theme and puts dark on <html>', async ({ page }) => {
    await signInToDashboard(page);
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_GROUND);
  });
});

test.describe('with the operating system in light mode', () => {
  test.use({ colorScheme: 'light' });

  test('a saved dark preference renders the dashboard dark from the first paint', async ({
    page,
  }) => {
    await page.addInitScript(() => window.localStorage.setItem('quro-theme', 'dark'));
    await signInToDashboard(page);
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      true,
    );
    await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_GROUND);
  });
});

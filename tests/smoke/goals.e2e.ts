import { expect, test } from '@playwright/test';

// The demo seed's user (packages/backend/src/db/demoSeed.ts); DEMO_USER_PASSWORD overrides the
// default password there and here. Signing in, rather than signing up, keeps the smoke run under
// the signup rate limit.
const DEMO_EMAIL = 'demo@quro.local';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'password123';

test('an invest habit that spans two years shows on both year tabs, without manual months', async ({
  page,
}) => {
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

  await page.goto('/goals');
  const yearTabs = page.getByRole('group', { name: 'Goal year' });
  const openYear = (year: number) =>
    yearTabs.getByRole('button', { name: new RegExp(`^${year}`) }).click();

  // November of this year to February of the next: four months across a year boundary.
  const year = new Date().getFullYear();
  const name = `Smoke habit ${Date.now()}`;
  await page.getByRole('button', { name: 'Add goal', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button').filter({ hasText: 'Invest habit' }).click();
  await dialog.getByPlaceholder('e.g. Hit 100k salary').fill(name);
  await dialog.getByPlaceholder('500.00').fill('500');
  const [startMonth, endMonth] = [0, 1].map((index) =>
    dialog.locator('input[type="month"]').nth(index),
  );
  await startMonth!.fill(`${year + 1}-03`);
  await endMonth!.fill(`${year + 1}-02`);
  await expect(dialog.getByRole('alert')).toHaveText('The start month is after the end month.');
  await expect(dialog.getByRole('button', { name: 'Save goal' })).toBeDisabled();
  await startMonth!.fill(`${year}-11`);
  await expect(dialog.getByText('4 months in range.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save goal' }).click();
  await expect(dialog).toHaveCount(0);

  for (const tab of [year, year + 1]) {
    await openYear(tab);
    // The card and the at-a-glance list both name the goal.
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('0/4 months').first()).toBeVisible();
  }

  // Months come from investment buys only: no cell or control edits them.
  await expect(
    page.getByRole('img', { name: new RegExp(`^Jan ${year + 1}: upcoming`) }).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /mark a month|completed month/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Investments page' }).first()).toBeVisible();
});

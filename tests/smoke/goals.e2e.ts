import { expect, test } from '@playwright/test';
import { BACKEND_ORIGIN, issueInviteCode } from './environment';

test('an invest habit that spans two years shows on both year tabs, without manual months', async ({
  page,
}) => {
  const runId = Date.now();
  const signup = await page.request.post(`${BACKEND_ORIGIN}/api/auth/signup`, {
    data: {
      firstName: 'Playwright',
      lastName: 'Goals',
      email: `goals-${runId}@playwright.quro.test`,
      password: `Goals-${runId}-Pass123!`,
      age: 35,
      retirementAge: 67,
      inviteCode: issueInviteCode(),
    },
  });
  expect(signup.status()).toBe(201);

  // November of this year to February of the next: four months across a year boundary.
  const year = new Date().getFullYear();
  const name = `Smoke habit ${runId}`;

  await page.goto('/goals');
  await page.getByRole('button', { name: 'Add goal', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button').filter({ hasText: 'Invest habit' }).click();
  await dialog.getByPlaceholder('e.g. Hit 100k salary').fill(name);
  await dialog.getByPlaceholder('500.00').fill('500');
  await dialog.getByLabel('Start month').fill(`${year + 1}-03`);
  await dialog.getByLabel('End month').fill(`${year + 1}-02`);
  await expect(dialog.getByRole('alert')).toHaveText('The start month is after the end month.');
  await expect(dialog.getByRole('button', { name: 'Save goal' })).toBeDisabled();
  await dialog.getByLabel('Start month').fill(`${year}-11`);
  await expect(dialog.getByText('4 months in range.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save goal' }).click();
  await expect(dialog).toHaveCount(0);

  const yearTabs = page.getByRole('group', { name: 'Goal year' });
  for (const tab of [year, year + 1]) {
    await yearTabs.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    // The card and the at-a-glance list both name the goal.
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('0/4 months')).toBeVisible();
  }

  // Months come from investment buys only: no cell or control edits them.
  await expect(
    page.getByRole('img', { name: new RegExp(`^Jan ${year + 1}: upcoming`) }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /mark a month|completed month/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Investments page' })).toBeVisible();
});

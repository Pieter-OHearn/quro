import { expect, test } from '@playwright/test';

// A provider sign-in that does not end in a session returns the browser to the landing page with
// a reason. The sign-in form opens on it, shows what to do, and drops the reason from the address.
test('the landing page explains why a provider sign-in did not finish', async ({ page }) => {
  await page.goto('/welcome?sso=no_account');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('signin-sso-error')).toContainText('No Quro account uses');
  await expect(page).toHaveURL(/\/welcome$/);
  // A reason it does not know shows nothing, and the form is not forced open.
  await page.goto('/welcome?sso=%3Cscript%3E');
  await expect(page.getByRole('button', { name: 'Get started free' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

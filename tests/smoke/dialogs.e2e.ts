import { expect, test, type Page } from '@playwright/test';
import { CURRENCY_CODES } from '../../packages/shared/src';

const USER = {
  id: 125,
  firstName: 'Dialog',
  lastName: 'Test',
  email: 'dialogs@quro.test',
  age: 35,
  retirementAge: 67,
  baseCurrency: 'EUR',
  numberFormat: 'en-GB',
  passwordUpdatedAt: null,
};

async function mockApi(page: Page) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === '/api/auth/me') data = USER;
    if (path === '/api/currency/rates')
      data = CURRENCY_CODES.map((currency, index) => ({
        id: index + 1,
        fromCurrency: currency,
        toCurrency: 'EUR',
        rate: 1,
        updatedAt: new Date().toISOString(),
      }));
    return route.fulfill({ json: { data } });
  });
}

async function openAddDebt(page: Page) {
  await page.getByRole('button', { name: 'Add debt' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add debt' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('a dialog without edits closes at once and leaves with its fade', async ({ page }) => {
  await mockApi(page);
  await page.goto('/debts');
  const dialog = await openAddDebt(page);

  await page.keyboard.press('Escape');
  // The dialog stays mounted, marked closing, until its fade has ended, then it is removed.
  await expect(page.locator('[role="dialog"][data-closing]')).toHaveCount(1);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add debt' }).first()).toBeFocused();
});

test('a dialog with edits asks before it discards them', async ({ page }) => {
  await mockApi(page);
  await page.goto('/debts');
  const dialog = await openAddDebt(page);
  const nameField = dialog.getByPlaceholder('e.g. Volkswagen Golf Loan');
  await nameField.fill('Example car loan');

  // Escape asks; Escape again keeps the edits.
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('alert')).toHaveText('Discard your changes?');
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(nameField).toHaveValue('Example car loan');

  // The close button asks; discarding closes the dialog.
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(dialog).toHaveCount(0);

  // Opened again, the form starts clean and closes without asking.
  const reopened = await openAddDebt(page);
  await page.keyboard.press('Escape');
  await expect(reopened).toHaveCount(0);

  // Cancel is the explicit way to discard, so it closes at once.
  const again = await openAddDebt(page);
  await again.getByPlaceholder('e.g. Volkswagen Golf Loan').fill('Example car loan');
  await again.getByRole('button', { name: 'Cancel' }).click();
  await expect(again).toHaveCount(0);
});

test('leaving the page with edits in a dialog asks first', async ({ page }) => {
  await mockApi(page);
  await page.goto('/savings');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Debts' }).click();
  await expect(page).toHaveURL(/\/debts$/);
  const dialog = await openAddDebt(page);
  await dialog.getByPlaceholder('e.g. Volkswagen Golf Loan').fill('Example car loan');

  // The browser's back button is held until the edits are kept or discarded.
  await page.goBack();
  await expect(dialog.getByRole('alert')).toHaveText('Discard your changes?');
  await expect(page).toHaveURL(/\/debts$/);
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/\/debts$/);

  await page.goBack();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page).toHaveURL(/\/savings$/);
});

test('leaving a settings form with unsaved edits asks first', async ({ page }) => {
  await mockApi(page);
  await page.goto('/settings');
  const firstName = page.getByPlaceholder('John', { exact: true });
  await firstName.fill('Edited');
  const debtsLink = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Debts' });

  await debtsLink.click();
  const prompt = page.getByRole('dialog', { name: 'Discard your changes?' });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(firstName).toHaveValue('Edited');

  await debtsLink.click();
  await page
    .getByRole('dialog', { name: 'Discard your changes?' })
    .getByRole('button', { name: 'Discard changes' })
    .click();
  await expect(page).toHaveURL(/\/debts$/);
});

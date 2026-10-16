import { expect, test, type Page } from '@playwright/test';
import { CURRENCY_CODES } from '../../packages/shared/src';

const USER = {
  id: 124,
  firstName: 'Form',
  lastName: 'Test',
  email: 'forms@quro.test',
  age: 35,
  retirementAge: 67,
  baseCurrency: 'EUR',
  numberFormat: 'en-GB',
  passwordUpdatedAt: null,
};

const PHONE = { width: 390, height: 600 };

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

test('an empty submit on a phone focuses the first invalid field and keeps the actions in view', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await mockApi(page);
  await page.goto('/debts');
  await page.getByRole('button', { name: 'Add debt' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Add debt' });
  await dialog.scrollIntoViewIfNeeded();
  const submit = dialog.getByRole('button', { name: 'Add debt' });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });

  // Cancel and the submit button share one 44px row at the foot of the sheet.
  const [cancelBox, submitBox] = await Promise.all([cancel.boundingBox(), submit.boundingBox()]);
  expect(cancelBox?.y).toBe(submitBox?.y);
  expect(submitBox?.height).toBeGreaterThanOrEqual(44);

  await submit.click();
  const nameField = dialog.getByPlaceholder('e.g. Volkswagen Golf Loan');
  await expect(nameField).toBeFocused();
  await expect(dialog.getByRole('alert').first()).toBeVisible();

  // The first invalid field is not hidden behind the sticky actions.
  const [fieldBox, footerBox] = await Promise.all([nameField.boundingBox(), submit.boundingBox()]);
  expect((fieldBox?.y ?? 0) + (fieldBox?.height ?? 0)).toBeLessThanOrEqual(footerBox?.y ?? 0);
});

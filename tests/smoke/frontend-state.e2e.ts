import { expect, test, type Page } from '@playwright/test';
import { CURRENCY_CODES } from '../../packages/shared/src';

const USER = {
  id: 123,
  firstName: 'State',
  lastName: 'Test',
  email: 'state@quro.test',
  age: 35,
  retirementAge: 67,
  location: 'Amsterdam',
  jurisdiction: 'NL',
  baseCurrency: 'EUR',
  numberFormat: 'en-US',
  passwordUpdatedAt: null,
};
async function mockSettingsApi(page: Page) {
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

test('profile save resets keyed form values without losing pending or saved feedback', async ({
  page,
}) => {
  await mockSettingsApi(page);
  let finishSave: (() => void) | undefined;
  const releaseSave = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/settings/profile', async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await releaseSave;
    return route.fulfill({ json: { data: { ...USER, ...submitted, firstName: 'Normalized' } } });
  });
  await page.goto('/settings');
  await page.getByPlaceholder('John', { exact: true }).fill(' Updated ');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  expect(submitted?.firstName).toBe('Updated');
  finishSave?.();
  await expect(page.getByPlaceholder('John', { exact: true })).toHaveValue('Normalized');
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
});

test('preferences retain saved feedback after a user update and render request failures', async ({
  page,
}) => {
  await mockSettingsApi(page);
  let fail = true;
  await page.route('**/api/settings/preferences', (route) => {
    if (fail) return route.fulfill({ status: 500, json: { error: 'Preference save failed' } });
    return route.fulfill({ json: { data: { ...USER, ...route.request().postDataJSON() } } });
  });
  await page.goto('/settings?tab=preferences');
  await page.getByRole('button').filter({ hasText: 'GBP' }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Preference save failed', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await expect(page.getByText('Preference save failed', { exact: true })).toBeHidden();
});

test('mortgage selection follows URL changes and preserves unrelated search parameters', async ({
  page,
}) => {
  await mockSettingsApi(page);
  const mortgages = [1, 2].map((id) => ({
    id,
    userId: USER.id,
    propertyAddress: `Home ${id}`,
    lender: 'Test Bank',
    currency: 'EUR',
    originalAmount: 100000,
    outstandingBalance: 50000,
    propertyValue: 200000,
    monthlyPayment: 2500,
    interestRate: 3,
    rateType: 'Fixed',
    repaymentType: 'Annuity',
    fixedUntil: '2034-03-31',
    termYears: 4,
    startDate: '2030-03-31',
    endDate: '2034-03-31',
    overpaymentLimit: 10,
    isJoint: false,
  }));
  await page.route('**/api/mortgages', (route) => route.fulfill({ json: { data: mortgages } }));
  await page.goto('/mortgage?mortgageId=2&filter=active');
  await expect(page.getByRole('button', { name: 'Home 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Home 1', exact: true }).click();
  await expect(page).toHaveURL(/mortgageId=1&filter=active/);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Home 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: 'Mortgage', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Home 1', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

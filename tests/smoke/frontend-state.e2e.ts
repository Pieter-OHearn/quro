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

const PENSION_POT = {
  id: 7,
  name: 'UI Retirement',
  provider: 'Test Provider',
  type: 'Workplace',
  balance: 1234.56,
  currency: 'EUR',
  employeeMonthly: 100,
  employerMonthly: 100,
  investmentStrategy: null,
  metadata: {},
  color: '#6366f1',
  emoji: '🏦',
  notes: '',
};

async function mockPensionUi(page: Page) {
  await mockSettingsApi(page);
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { data: { ...USER, numberFormat: 'de-DE' } } }),
  );
  await page.route('**/api/pensions/pots*', (route) =>
    route.fulfill({ json: { data: [PENSION_POT] } }),
  );
  await page.route('**/api/capabilities', (route) =>
    route.fulfill({ json: { data: { pensionStatementImport: { enabled: true } } } }),
  );
  await page.goto('/pension');
  await page.getByRole('button', { name: 'View transactions', exact: true }).click();
}

test('pension import traps keyboard focus, closes on Escape, and restores the trigger', async ({
  page,
}) => {
  await mockPensionUi(page);
  const trigger = page.getByRole('button', { name: 'Import Annual Statement PDF' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Import Annual Statement' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Upload & Process', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('archive warnings use the saved number format and keep deletion gated by the name', async ({
  page,
}) => {
  await mockPensionUi(page);
  await page.getByRole('button', { name: 'Remove Pot', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove Pension pot' });
  await expect(dialog.getByText(/still has a balance of/)).toContainText('1.234,56');
  const remove = dialog.getByRole('button', { name: 'Delete', exact: true });
  await expect(remove).toBeDisabled();
  await dialog.getByPlaceholder('UI Retirement', { exact: true }).fill('UI Retirement');
  await expect(remove).toBeEnabled();
});

test('wide pension review keeps compact fields editable and the footer visible on desktop and mobile', async ({
  page,
}, testInfo) => {
  await mockPensionUi(page);
  const job = { id: 11, potId: 7, status: 'ready_for_review', fileName: 'statement.pdf' };
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    importId: 11,
    rowOrder: index,
    type: 'contribution',
    amount: 100,
    taxAmount: 0,
    date: '2026-01-01',
    note: `Contribution ${index + 1}`,
    isEmployer: false,
    confidence: 1,
    confidenceLabel: 'high',
    evidence: [],
    isDerived: false,
    isDeleted: false,
    collisionWarning: null,
    committedTransactionId: null,
    editedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }));
  await page.route('**/api/pensions/imports', (route) => route.fulfill({ json: { data: job } }));
  await page.route('**/api/pensions/imports/11', (route) => route.fulfill({ json: { data: job } }));
  // The rows hook pages through the list, so the request carries `limit` (and `cursor`).
  await page.route('**/api/pensions/imports/11/rows*', (route) =>
    route.fulfill({ json: { data: rows, nextCursor: null } }),
  );
  await page.getByRole('button', { name: 'Import Annual Statement PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import Annual Statement' });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'statement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF'),
  });
  await dialog.getByRole('button', { name: 'Upload & Process', exact: true }).click();
  await expect(dialog.getByPlaceholder('Add note...')).toHaveCount(12);
  await dialog.getByPlaceholder('Add note...').first().fill('Updated note');
  await expect(dialog.getByPlaceholder('Add note...').first()).toHaveValue('Updated note');
  await dialog.getByRole('combobox').first().selectOption('fee');
  await expect(dialog.getByRole('combobox').first()).toHaveValue('fee');
  await expect(dialog).toHaveClass(/max-w-3xl/);
  await expect(
    dialog.getByRole('button', { name: 'Commit Transactions', exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('import-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole('button', { name: 'Commit Transactions', exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath('import-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

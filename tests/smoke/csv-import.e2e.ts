import { expect, test } from '@playwright/test';
import { BACKEND_ORIGIN, issueInviteCode } from './environment';

const STATEMENT = [
  'Booking date,Amount,Description,Balance',
  '2026-02-02,-12.50,Coffee beans,987.50',
  '2026-02-03,100.00,Refund,1087.50',
  '2026-02-04,abc,Broken row,',
].join('\n');

test('imports a reviewed bank CSV into a savings account and finds it again on a second import', async ({
  page,
}) => {
  const runId = Date.now();
  const accountName = `CSV Reserve ${runId}`;
  const signup = await page.request.post(`${BACKEND_ORIGIN}/api/auth/signup`, {
    data: {
      firstName: 'Playwright',
      lastName: 'Import',
      email: `import-${runId}@playwright.quro.test`,
      password: `Import-${runId}-Pass123!`,
      age: 35,
      retirementAge: 67,
      inviteCode: issueInviteCode(),
    },
  });
  expect(signup.status()).toBe(201);

  await page.goto('/savings');
  await page.getByTestId('savings-add-account-button').click();
  const accountDialog = page.getByRole('dialog');
  await accountDialog.getByTestId('savings-account-name-input').fill(accountName);
  await accountDialog.getByTestId('savings-account-bank-input').fill('Smoke Bank');
  await accountDialog.getByTestId('savings-account-balance-input').fill('1000');
  await accountDialog.getByTestId('savings-account-rate-input').fill('1');
  await accountDialog.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByText(accountName)).toBeVisible();

  async function importStatement() {
    const importButton = page.getByRole('button', { name: 'Import CSV' });
    // The account stays expanded after the first import; clicking its name again would close it.
    if (!(await importButton.isVisible())) {
      await page.getByText(accountName, { exact: true }).click();
    }
    await importButton.click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'statement.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(STATEMENT),
    });
    await expect(dialog.getByRole('heading', { name: /Match the columns/ })).toBeVisible();
    await dialog.getByPlaceholder('Bank and account').fill('Smoke statement');
    await dialog.getByRole('button', { name: 'Preview rows' }).click();
    await expect(dialog.getByRole('heading', { name: /Review the rows/ })).toBeVisible();
    return dialog;
  }

  const first = await importStatement();
  await expect(first.getByText('2 ready, 1 with errors')).toBeVisible();
  await expect(first.getByText('The amount is not a number')).toBeVisible();
  await expect(first.getByText('Balance check')).toBeVisible();
  await first.getByRole('button', { name: 'Import 2 rows' }).click();
  await expect(first.getByText('The import is finished')).toBeVisible();
  await expect(first.getByText('The ledger agrees with the statement.')).toBeVisible();
  await first.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Imported · Withdrawal').first()).toBeVisible();

  // The same file again offers nothing to write: every good row is already imported.
  const second = await importStatement();
  await expect(second.getByText('2 already imported, 1 with errors')).toBeVisible();
  await expect(second.getByRole('button', { name: 'Import 0 rows' })).toBeDisabled();
});

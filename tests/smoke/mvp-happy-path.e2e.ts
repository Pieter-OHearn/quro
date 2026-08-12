import { expect, test } from '@playwright/test';

const BACKEND_ORIGIN =
  process.env.QRO_SMOKE_BACKEND_ORIGIN ?? process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:3300';

function normalizeText(value: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

test('covers the MVP happy path from sign-in through dashboard verification', async ({ page }) => {
  const runId = Date.now();
  const smokeEmail = `smoke-${runId}@playwright.quro.test`;
  const smokePassword = `Smoke-${runId}-Pass123!`;
  const today = new Date();
  const payDate = today.toISOString().slice(0, 10);
  const savingsName = `Smoke Reserve ${runId}`;
  const secondSavingsName = `Smoke Buffer ${runId}`;
  const budgetName = `Smoke Budget ${runId}`;
  const payslipMonth = `Smoke ${payDate} ${runId}`;

  const signupResponse = await page.request.post(`${BACKEND_ORIGIN}/api/auth/signup`, {
    data: {
      firstName: 'Playwright',
      lastName: 'Smoke',
      email: smokeEmail,
      password: smokePassword,
      age: 35,
      retirementAge: 67,
    },
  });
  expect(signupResponse.status()).toBe(201);

  // Clear the backend session established during signup so the UI flow still hits the
  // anonymous landing page instead of being auto-redirected to the dashboard.
  await page.request.post(`${BACKEND_ORIGIN}/api/auth/signout`);

  await page.goto('/welcome');
  const openSignIn = page.getByRole('button', { name: /sign in/i }).first();
  await openSignIn.focus();
  await openSignIn.click();

  const signInDialog = page.getByRole('dialog');
  await expect(signInDialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(signInDialog).toBeHidden();
  await expect(openSignIn).toBeFocused();
  await openSignIn.click();
  await signInDialog.getByTestId('signin-email-input').fill(smokeEmail);
  await signInDialog.getByTestId('signin-password-input').fill(smokePassword);
  await signInDialog.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();

  const initialNetWorth = normalizeText(
    await page.getByTestId('dashboard-net-worth-value').textContent(),
  );
  const initialMonthlySalary = normalizeText(
    await page.getByTestId('dashboard-monthly-salary-card').textContent(),
  );

  await page.getByRole('link', { name: 'Savings', exact: true }).click();
  await page.getByTestId('savings-add-account-button').click();

  const savingsDialog = page.getByRole('dialog');
  await savingsDialog.getByTestId('savings-account-name-input').fill(savingsName);
  await savingsDialog.getByTestId('savings-account-bank-input').fill('Smoke Bank');
  await savingsDialog.getByTestId('savings-account-balance-input').fill('3210');
  await savingsDialog.getByTestId('savings-account-rate-input').fill('2.75');
  await savingsDialog.getByRole('button', { name: 'Add Account' }).click();

  await expect(page.getByText(savingsName)).toBeVisible();

  await page.getByTestId('savings-add-account-button').click();
  await savingsDialog.getByTestId('savings-account-name-input').fill(secondSavingsName);
  await savingsDialog.getByTestId('savings-account-bank-input').fill('Another Smoke Bank');
  await savingsDialog.getByTestId('savings-account-balance-input').fill('2100');
  await savingsDialog.getByTestId('savings-account-rate-input').fill('2.5');
  await savingsDialog.getByRole('button', { name: 'Add Account' }).click();
  await expect(page.getByText(secondSavingsName)).toBeVisible();

  await page.getByRole('link', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Review banks' }).click();
  const bankingDialog = page.getByRole('dialog', { name: 'Review banking entities' });
  const firstBankRow = bankingDialog.getByRole('region', { name: savingsName });
  const secondBankRow = bankingDialog.getByRole('region', { name: secondSavingsName });

  await secondBankRow.locator('select').first().selectOption('__manual__');
  await secondBankRow.locator('input').nth(0).fill('Draft Banking Group Ltd');
  await secondBankRow.locator('input').nth(1).fill('Draft protection scheme');
  await secondBankRow.locator('input').nth(2).fill('250000');
  await secondBankRow.locator('select').nth(1).selectOption('AUD');

  await firstBankRow.locator('select').first().selectOption('bunq');
  await page.route('**/api/savings/accounts/*/banking-entity', (route) => route.abort());
  await firstBankRow.getByRole('button', { name: 'Confirm entity' }).click();
  await expect(firstBankRow.getByText('The banking entity could not be saved.')).toBeVisible();
  await page.unroute('**/api/savings/accounts/*/banking-entity');
  await firstBankRow.getByRole('button', { name: 'Confirm entity' }).click();
  await expect(firstBankRow.getByText('Confirmed by you')).toBeVisible();

  // A refetch after saving another row must not discard this unsaved manual draft.
  await expect(secondBankRow.locator('input').nth(0)).toHaveValue('Draft Banking Group Ltd');
  await expect(secondBankRow.locator('input').nth(2)).toHaveValue('250000');
  await expect(secondBankRow.locator('select').nth(1)).toHaveValue('AUD');

  await page.route('**/api/savings/accounts/*/banking-entity', (route) => route.abort());
  await firstBankRow.getByRole('button', { name: 'Use automatic matching' }).click();
  await expect(firstBankRow.getByText('The banking entity could not be saved.')).toBeVisible();
  await page.unroute('**/api/savings/accounts/*/banking-entity');
  await firstBankRow.getByRole('button', { name: 'Use automatic matching' }).click();
  await expect(firstBankRow.getByText('Needs review')).toBeVisible();
  await bankingDialog.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await page.getByTestId('budget-add-category-button').click();
  const budgetDialog = page.getByRole('dialog');
  await budgetDialog.getByTestId('budget-category-name-input').fill(budgetName);
  await budgetDialog.getByTestId('budget-category-budget-input').fill('321');
  await budgetDialog.getByRole('button', { name: 'Add Category' }).click();

  await expect(page.locator('p').filter({ hasText: budgetName }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Salary', exact: true }).click();
  await page.getByTestId('salary-add-payslip-button').click();

  const payslipDialog = page.getByRole('dialog');
  await payslipDialog.getByTestId('salary-payslip-month-input').fill(payslipMonth);
  await payslipDialog.getByTestId('salary-payslip-date-input').fill(payDate);
  await payslipDialog.getByTestId('salary-payslip-gross-input').fill('8200');
  await payslipDialog.getByTestId('salary-payslip-bonus-input').fill('300');
  await payslipDialog.getByTestId('salary-payslip-tax-input').fill('2200');
  await payslipDialog.getByTestId('salary-payslip-pension-input').fill('400');
  await payslipDialog.getByRole('button', { name: 'Save Payslip' }).click();

  await expect(page.getByText(payslipMonth, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();

  await expect
    .poll(async () =>
      normalizeText(await page.getByTestId('dashboard-net-worth-value').textContent()),
    )
    .not.toBe(initialNetWorth);
  await expect
    .poll(async () =>
      normalizeText(await page.getByTestId('dashboard-monthly-salary-card').textContent()),
    )
    .not.toBe(initialMonthlySalary);
  await expect(page.getByText(`Salary ${payslipMonth}`)).toBeVisible();
});

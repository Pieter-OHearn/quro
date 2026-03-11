import { expect, test } from '@playwright/test';

const DEMO_EMAIL = 'demo@quro.local';
const DEMO_PASSWORD = 'password123';

function normalizeText(value: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

test('covers the MVP happy path from sign-in through dashboard verification', async ({ page }) => {
  const runId = Date.now();
  const today = new Date();
  const payDate = today.toISOString().slice(0, 10);
  const savingsName = `Smoke Reserve ${runId}`;
  const budgetName = `Smoke Budget ${runId}`;
  const payslipMonth = `Smoke ${payDate} ${runId}`;

  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Sign In' }).first().click();

  const signInDialog = page.getByRole('dialog');
  await signInDialog.getByTestId('signin-email-input').fill(DEMO_EMAIL);
  await signInDialog.getByTestId('signin-password-input').fill(DEMO_PASSWORD);
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

  await page.getByRole('link', { name: 'Budget', exact: true }).click();
  await page.getByTestId('budget-add-category-button').click();
  await page.getByTestId('budget-category-name-input').fill(budgetName);
  await page.getByTestId('budget-category-budget-input').fill('321');
  await page.getByTestId('budget-category-submit-button').click();

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

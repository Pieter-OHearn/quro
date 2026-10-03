import { expect, test, type Page } from '@playwright/test';
import { CURRENCY_CODES } from '../../packages/shared/src';

const USER = {
  id: 123,
  firstName: 'Performance',
  lastName: 'Test',
  email: 'performance@quro.test',
  age: 35,
  retirementAge: 67,
  baseCurrency: 'EUR',
  numberFormat: 'en-GB',
};
const ALLOCATIONS = {
  allocations: [],
  currency: 'EUR',
  liabilitiesCurrency: 'EUR',
  netWorth: 0,
  portfolioTotal: 0,
  totalAssets: 0,
  liabilitiesTotal: 0,
  debtCount: 0,
};

async function mockApi(page: Page, authenticated: boolean, importStatuses: string[] = []) {
  const requests: string[] = [];
  let importRequests = 0;
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    let data: unknown = [];
    if (path === '/api/auth/me') data = authenticated ? USER : null;
    if (path === '/api/currency/rates')
      data = CURRENCY_CODES.map((currency, index) => ({
        id: index + 1,
        fromCurrency: currency,
        toCurrency: 'EUR',
        rate: 1,
        updatedAt: new Date().toISOString(),
      }));
    if (path === '/api/dashboard/summary') data = { allocations: ALLOCATIONS, netWorth: [] };
    if (path === '/api/dashboard/insights')
      data = { latestPayslip: null, salaryMonths: [], investHabitBuyMonths: [] };
    if (path === '/api/pensions/imports') {
      const status = importStatuses[Math.min(importRequests, importStatuses.length - 1)];
      importRequests += 1;
      data = status
        ? [
            {
              import: {
                id: 1,
                potId: 1,
                status,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              pot: { id: 1, name: 'Pension', provider: 'Provider', emoji: null },
            },
          ]
        : [];
    }
    return route.fulfill({ json: { data } });
  });
  return { requests, importRequests: () => importRequests };
}

test('welcome defers financial pages, charts and emoji runtime', async ({ page }) => {
  await mockApi(page, false);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/welcome');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true }).first()).toBeVisible();
  expect(
    requests.filter((url) =>
      /recharts|CategoricalChart|CartesianChart|emoji-picker-react|DashboardPage|InvestmentsPage/.test(
        url,
      ),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('dashboard uses compact insights and emoji runtime loads only when the picker opens', async ({
  page,
}) => {
  const api = await mockApi(page, true);
  const emojiRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('emoji-picker-react')) emojiRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();
  expect(api.requests).toContain('/api/dashboard/insights');
  expect(api.requests).not.toContain('/api/salary/payslips');
  expect(api.requests).not.toContain('/api/investments/holding-transactions');
  expect(emojiRequests).toEqual([]);
  await page.getByRole('link', { name: 'Goals', exact: true }).click();
  await page.getByRole('button', { name: 'Add Goal', exact: true }).click();
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'Savings Goal' }).click();
  expect(emojiRequests).toEqual([]);
  await page.getByTitle('Pick an emoji', { exact: true }).click();
  await expect(page.locator('.EmojiPickerReact')).toBeVisible();
  expect(emojiRequests.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'smiling face with heart eyes', exact: true }).click();
  await expect(page.locator('.EmojiPickerReact')).toBeHidden();
  expect(errors).toEqual([]);
});

test('notification polling stops once an active import becomes ready', async ({ page }) => {
  const api = await mockApi(page, true, ['queued', 'ready_for_review']);
  await page.goto('/');
  await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();
  await expect.poll(api.importRequests).toBe(2);
  await page.clock.install();
  await page.clock.fastForward(60_000);
  expect(api.importRequests()).toBe(2);
});

test('opening idle notifications discovers external jobs and restarts active polling', async ({
  page,
}) => {
  const api = await mockApi(page, true, ['ready_for_review', 'queued', 'ready_for_review']);
  await page.goto('/');
  await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();
  await expect.poll(api.importRequests).toBe(1);
  await page.getByTitle('Notifications', { exact: true }).click();
  await expect(page.getByText('Statement queued', { exact: true })).toBeVisible();
  await expect.poll(api.importRequests).toBe(3);
  await expect(page.getByText('Statement ready to review', { exact: true })).toBeVisible();
});

test('returning to the window refreshes a recently cached idle notification feed', async ({
  page,
}) => {
  const api = await mockApi(page, true, ['ready_for_review', 'queued', 'ready_for_review']);
  await page.goto('/');
  await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();
  await expect.poll(api.importRequests).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(api.importRequests).toBe(3);
});

test('mortgage metrics refresh after calendar rollover with unchanged server data', async ({
  page,
}) => {
  await mockApi(page, true);
  await page.route('**/api/mortgages', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 1,
            userId: USER.id,
            propertyAddress: 'Calendar Test',
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
          },
        ],
      },
    }),
  );
  await page.clock.setFixedTime(new Date('2032-04-30T12:00:00Z'));
  await page.goto('/mortgage');
  await expect(page.getByText('~24 months', { exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date('2032-05-01T12:00:00Z'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByText('~23 months', { exact: true })).toBeVisible();
});

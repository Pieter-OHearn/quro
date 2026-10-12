import { expect, test, type Page } from '@playwright/test';
import { CURRENCY_CODES } from '../../packages/shared/src';

const USER = {
  id: 123,
  firstName: 'Phone',
  lastName: 'Test',
  email: 'phone@quro.test',
  age: 35,
  retirementAge: 67,
  baseCurrency: 'EUR',
  numberFormat: 'en-GB',
  passwordUpdatedAt: null,
};

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 640, height: 900 };
const DESKTOP = { width: 1280, height: 900 };
const MIN_TOUCH_TARGET_PX = 44;

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

// Below 640px the sidebar is a closed drawer and the tab bar is the visible main navigation.
const tabBar = (page: Page) => page.locator('nav.fixed[aria-label="Main"]');

test('the phone tab bar replaces the sidebar and navigates to Savings', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockApi(page);
  await page.goto('/settings');

  const tabs = tabBar(page);
  await expect(tabs).toBeVisible();
  await expect(page.locator('aside')).toBeHidden();
  await expect(tabs.getByRole('link')).toHaveText([
    'Dashboard',
    'Savings',
    'Investments',
    'Budget',
  ]);
  await expect(tabs.getByRole('button', { name: 'More', exact: true })).toBeVisible();
  // The phone header shows the logo, the page title and the account controls, but no date.
  await expect(page.locator('header p')).toBeHidden();

  for (const target of await tabs.locator('a, button').all()) {
    const box = await target.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(box?.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  }

  // The page scrolls inside main, which is padded by at least the tab bar's height.
  const tabBarHeight = (await tabs.boundingBox())?.height ?? 0;
  const mainPadding = await page
    .locator('main')
    .evaluate((main) => Number.parseFloat(getComputedStyle(main).paddingBottom));
  expect(mainPadding).toBeGreaterThanOrEqual(tabBarHeight);

  await tabs.getByRole('link', { name: 'Savings', exact: true }).click();
  await expect(page).toHaveURL(/\/savings$/);
  await expect(tabs.getByRole('link', { name: 'Savings', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Savings' })).toBeVisible();
});

test('More opens the navigation drawer with the other destinations', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockApi(page);
  await page.goto('/settings');

  const more = tabBar(page).getByRole('button', { name: 'More', exact: true });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const drawer = page.locator('aside');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: 'Pension', exact: true }).click();
  await expect(page).toHaveURL(/\/pension$/);
  await expect(drawer).toBeHidden();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
});

test('from 640px the tab bar is not rendered and the sidebar is the navigation', async ({
  page,
}) => {
  await mockApi(page);
  await page.setViewportSize(TABLET);
  await page.goto('/settings');
  await expect(tabBar(page)).toBeHidden();
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.click();
  await expect(page.locator('aside nav[aria-label="Main"]')).toBeVisible();

  await page.setViewportSize(DESKTOP);
  await page.goto('/settings');
  await expect(tabBar(page)).toBeHidden();
  await expect(menu).toBeHidden();
  await expect(page.locator('aside nav[aria-label="Main"]')).toBeVisible();
  // The sidebar lists destinations only, with no caption above them.
  await expect(page.locator('aside').getByText('Menu', { exact: true })).toHaveCount(0);
});

test('the drawer does not slide under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PHONE);
  await mockApi(page);
  await page.goto('/settings');

  const transition = await page
    .locator('aside')
    .evaluate((aside) => getComputedStyle(aside).transitionProperty);
  expect(transition).toBe('none');
});

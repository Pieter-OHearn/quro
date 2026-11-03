import { expect, test, type Page } from '@playwright/test';
import {
  EXPOSURE_DEFAULTS_VERSION,
  buildExposureHouseholdView,
  buildExposureView,
  computeExposureFacts,
  defaultExposureSettings,
  type ExposureReport,
} from '../../packages/shared/src';

// The demo seed's user (packages/backend/src/db/demoSeed.ts); DEMO_USER_PASSWORD overrides the
// default password there and here.
const DEMO_EMAIL = 'demo@quro.local';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'password123';

// The plain demo seed has no accounts or holdings, so the page is served a synthetic report built
// by the code the API runs: a holding, a joint account and a property with negative equity.
function syntheticReport(): ExposureReport {
  const settings = defaultExposureSettings();
  const facts = computeExposureFacts({
    asOf: '2026-10-09',
    baseCurrency: 'EUR',
    settings,
    settingsSource: 'default',
    holdings: [
      {
        id: 1,
        name: 'Example Global Fund',
        ticker: 'EXGF',
        currency: 'EUR',
        sector: 'Diversified',
        itemType: 'etf',
        assetClass: 'equity_developed',
        riskClassOverride: null,
        shares: 10,
        unitPrice: 100,
        priceSource: 'synced',
        priceUpdatedAt: '2026-10-09T18:00:00.000Z',
        priceStale: false,
      },
    ],
    savingsAccounts: [
      {
        id: 1,
        name: 'Example Pot',
        bank: 'Example Bank',
        currency: 'EUR',
        balance: 4000,
        isJoint: true,
      },
    ],
    properties: [
      {
        id: 1,
        name: '8 Example Court',
        propertyType: 'Buy-to-Let',
        currency: 'EUR',
        currentValue: 1000,
        isJoint: false,
        mortgage: { id: 1, outstandingBalance: 1500, isJoint: false },
      },
    ],
    fxRates: [],
  });
  return {
    facts,
    view: buildExposureView(facts),
    household: buildExposureHouseholdView(facts),
    settings: {
      settings,
      source: 'default',
      updatedAt: null,
      defaultsVersion: EXPOSURE_DEFAULTS_VERSION,
      storedInvalid: false,
    },
  };
}

async function signIn(page: Page) {
  await page.goto('/welcome');
  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();
  const signInDialog = page.getByRole('dialog');
  await signInDialog.getByTestId('signin-email-input').fill(DEMO_EMAIL);
  await signInDialog.getByTestId('signin-password-input').fill(DEMO_PASSWORD);
  await signInDialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('dashboard-net-worth-value')).toBeVisible();
}

test('Exposure opens on Everything and switches to Investments by link and back', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/exposure', (route) =>
    route.fulfill({ json: { data: syntheticReport() } }),
  );
  await page.goto('/plan?tab=exposure');

  const switcher = page.getByRole('group', { name: 'What Exposure counts' });
  const everything = switcher.getByRole('button', { name: 'Everything' });
  const investments = switcher.getByRole('button', { name: 'Investments' });
  await expect(everything).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('exposure-household-total')).toContainText('2,500.00');
  await expect(page.getByTestId('exposure-negative')).toContainText('8 Example Court');
  await expect(page.getByRole('button', { name: 'Customise' })).toBeHidden();

  await investments.click();
  await expect(page).toHaveURL(/[?&]view=investments/);
  await expect(page).toHaveURL(/[?&]tab=exposure/);
  await expect(page.getByTestId('exposure-statement')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Customise' })).toBeVisible();
  await expect(page.getByTestId('exposure-household-total')).toBeHidden();

  await page.reload();
  await expect(investments).toHaveAttribute('aria-pressed', 'true');

  await page.goBack();
  await expect(everything).toHaveAttribute('aria-pressed', 'true');
  await expect(page).not.toHaveURL(/[?&]view=/);
});

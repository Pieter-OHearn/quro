import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { defaultExposureSettings, type ExposureReport, type ExposureSettings } from '@quro/shared';
import { db } from '../db/client';
import {
  currencyRates,
  exposureSettings,
  holdings,
  mortgages,
  savingsAccounts,
} from '../db/schema';
import { invalidateCurrentCurrencyRateCache } from '../lib/currencyRateSync';
import { useFixtureCurrencyRates } from '../test/currencyRates';
import { createIntegrationHelpers, insertPartnerLink, type AuthSession } from '../test/integration';

const integration = createIntegrationHelpers('exposure.integration.quro.test');

async function readData<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  return ((await response.json()) as { data: T }).data;
}

async function getReport(session: AuthSession): Promise<ExposureReport> {
  return readData(await integration.request('/api/exposure', { cookie: session.cookie }));
}

type HoldingSpec = {
  name: string;
  currency?: string;
  price: number;
  shares: number;
  sector?: string;
  assetClass?: string | null;
  riskClassOverride?: number | null;
  manualPrice?: number | null;
  excludeFromSync?: boolean;
  priceUpdatedAt?: string | null;
};

async function addHolding(session: AuthSession, spec: HoldingSpec): Promise<number> {
  const created = await readData<{ id: number }>(
    await integration.request('/api/investments/holdings', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        name: spec.name,
        ticker: spec.name.slice(0, 4).toUpperCase(),
        currentPrice: spec.price,
        currency: spec.currency ?? 'EUR',
        sector: spec.sector ?? 'Diversified',
        itemType: 'etf',
        manualPrice: spec.manualPrice ?? null,
        excludeFromSync: spec.excludeFromSync ?? true,
        priceUpdatedAt: spec.priceUpdatedAt ?? null,
        assetClass: spec.assetClass ?? null,
        riskClassOverride: spec.riskClassOverride ?? null,
      },
    }),
    201,
  );
  await readData(
    await integration.request('/api/investments/holding-transactions', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        holdingId: created.id,
        type: 'buy',
        shares: spec.shares,
        price: spec.price,
        date: '2026-01-05',
        note: null,
      },
    }),
    201,
  );
  return created.id;
}

async function addSavings(
  session: AuthSession,
  spec: { name: string; balance: number; currency?: string; isJoint?: boolean },
): Promise<number> {
  const created = await readData<{ id: number }>(
    await integration.request('/api/savings/accounts', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        name: spec.name,
        bank: 'Synthetic Bank',
        balance: spec.balance,
        currency: spec.currency ?? 'EUR',
        interestRate: 1,
        accountType: 'Easy Access',
        color: '#0ea5e9',
        emoji: 'S',
        isJoint: spec.isJoint ?? false,
      },
    }),
    201,
  );
  return created.id;
}

async function addProperty(
  session: AuthSession,
  spec: { address: string; value: number; currency?: string; isJoint?: boolean; debt?: number },
): Promise<void> {
  const property = await readData<{ id: number }>(
    await integration.request('/api/investments/properties', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        address: spec.address,
        propertyType: 'primary_home',
        purchasePrice: spec.value,
        currentValue: spec.value,
        monthlyRent: 0,
        currency: spec.currency ?? 'EUR',
        emoji: 'H',
        isJoint: spec.isJoint ?? false,
      },
    }),
    201,
  );
  if (spec.debt === undefined) return;
  await readData(
    await integration.request('/api/mortgages', {
      method: 'POST',
      cookie: session.cookie,
      json: {
        linkedPropertyId: property.id,
        lender: 'Synthetic Lender',
        originalAmount: spec.debt,
        outstandingBalance: spec.debt,
        monthlyPayment: 1_000,
        interestRate: 3,
        rateType: 'fixed',
        fixedUntil: '2031-01-01',
        termYears: 30,
        startDate: '2021-01-01',
        endDate: '2051-01-01',
      },
    }),
    201,
  );
}

beforeAll(async () => {
  await integration.cleanup();
  await useFixtureCurrencyRates('exposure-integration-fixture');
  invalidateCurrentCurrencyRateCache();
});
afterAll(async () => {
  await integration.cleanup();
  invalidateCurrentCurrencyRateCache();
});

describe('exposure report', () => {
  test('refuses an anonymous caller and answers an empty account honestly', async () => {
    expect((await integration.request('/api/exposure')).status).toBe(401);
    const empty = await integration.signUp('empty');
    const report = await getReport(empty);
    expect(report.view.status).toBe('empty');
    expect(report.view.totalValue).toBe(0);
    expect(report.facts.warnings).toContainEqual({
      code: 'nothing_to_value',
      subject: 'portfolio',
    });
    expect(report.settings.source).toBe('default');
  });

  test('values holdings in EUR from the stored rates, in cents, and records the inputs', async () => {
    const owner = await integration.signUp('valuation');
    // 10 × 100 EUR; 20 × 50 USD at 0.92; 10 × 30 GBP at 1.18.
    const etf = await addHolding(owner, {
      name: 'Global ETF',
      price: 100,
      shares: 10,
      assetClass: 'equity_developed',
    });
    const usd = await addHolding(owner, {
      name: 'US Bond Fund',
      currency: 'USD',
      price: 50,
      shares: 20,
      assetClass: 'bond_investment_grade',
      riskClassOverride: 2,
    });
    await addHolding(owner, { name: 'UK Share', currency: 'GBP', price: 30, shares: 10 });

    const { facts, view } = await getReport(owner);
    expect(view.status).toBe('ready');
    expect(view.totalValue).toBe(1000 + 920 + 354);
    expect(view.baseCurrency).toBe('EUR');
    expect(view.holdings.map((h) => h.name)).toEqual(['Global ETF', 'US Bond Fund', 'UK Share']);
    expect(view.holdings.find((h) => h.id === usd)).toMatchObject({
      nativeValue: 1000,
      valueEur: 920,
      riskClass: 2,
      riskSource: 'override',
      currency: 'USD',
    });
    expect(view.unclassified.holdingCount).toBe(1);
    expect(view.currencies.map((c) => c.key).sort()).toEqual(['EUR', 'GBP', 'USD']);
    const total = facts.facts.find((fact) => fact.id === 'exposure.total_value')!;
    expect(total.value).toBe(2274);
    expect(total.inputs).toContainEqual({
      ref: 'fx:USD',
      value: 0.92,
      unit: 'rate',
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(facts.inputs.holdings.find((h) => h.id === etf)).toMatchObject({
      shares: 10,
      unitPrice: 100,
      valueEur: 1000,
    });
    // Private to the caller: the report matches the dashboard's brokerage figure.
    const allocations = await readData<{ allocations: { key: string; value: number }[] }>(
      await integration.request('/api/dashboard/allocations', { cookie: owner.cookie }),
    );
    expect(allocations.allocations.find((a) => a.key === 'brokerage')?.value).toBe(2274);
  });

  test('uses a price entered by hand and marks a synced price that has gone stale', async () => {
    const owner = await integration.signUp('prices');
    await addHolding(owner, { name: 'Manual One', price: 100, shares: 1, manualPrice: 120 });
    await addHolding(owner, {
      name: 'Old Synced',
      price: 50,
      shares: 2,
      excludeFromSync: false,
      priceUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    const { view, facts } = await getReport(owner);
    const manual = view.holdings.find((h) => h.name === 'Manual One')!;
    expect(manual).toMatchObject({ unitPrice: 120, priceSource: 'manual', priceStale: false });
    expect(view.holdings.find((h) => h.name === 'Old Synced')?.priceStale).toBe(true);
    expect(facts.warnings.map((w) => w.code)).toContain('price_stale');
  });

  test("keeps a partner's holdings out, linked or not, in both directions", async () => {
    const owner = await integration.signUp('household-owner');
    const partner = await integration.signUp('household-partner');
    await addHolding(owner, { name: 'Owner Holding', price: 10, shares: 10 });
    await addHolding(partner, { name: 'Partner Holding', price: 20, shares: 10 });
    await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');

    const ownerReport = await getReport(owner);
    const partnerReport = await getReport(partner);
    expect(ownerReport.view.holdings.map((h) => h.name)).toEqual(['Owner Holding']);
    expect(ownerReport.view.totalValue).toBe(100);
    expect(partnerReport.view.holdings.map((h) => h.name)).toEqual(['Partner Holding']);
    expect(partnerReport.view.totalValue).toBe(200);
    expect(JSON.stringify(ownerReport)).not.toContain('Partner Holding');
  });

  test('reports a holding whose currency has no stored rate instead of valuing it 1:1', async () => {
    const owner = await integration.signUp('missing-rate');
    await addHolding(owner, { name: 'Euro One', price: 100, shares: 1 });
    await addHolding(owner, { name: 'Swiss One', currency: 'CHF', price: 100, shares: 1 });
    await db.delete(currencyRates).where(eq(currencyRates.fromCurrency, 'CHF'));
    invalidateCurrentCurrencyRateCache();
    try {
      const { view, facts } = await getReport(owner);
      expect(view.totalValue).toBe(100);
      expect(view.excluded).toEqual([
        expect.objectContaining({ name: 'Swiss One', reason: 'no_fx_rate' }),
      ]);
      expect(facts.warnings).toContainEqual({ code: 'fx_rate_missing', subject: 'fx:CHF' });
    } finally {
      await useFixtureCurrencyRates('exposure-integration-fixture');
      invalidateCurrentCurrencyRateCache();
    }
  });

  test('says when a rate in use is older than 48 hours', async () => {
    const owner = await integration.signUp('stale-rate');
    await addHolding(owner, { name: 'Dollar One', currency: 'USD', price: 100, shares: 1 });
    await db
      .update(currencyRates)
      .set({ updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) })
      .where(eq(currencyRates.fromCurrency, 'USD'));
    invalidateCurrentCurrencyRateCache();
    try {
      const { facts } = await getReport(owner);
      expect(facts.warnings).toContainEqual({ code: 'fx_rate_stale', subject: 'fx:USD' });
      expect(facts.inputs.fxRates[0]).toMatchObject({ currency: 'USD', stale: true });
    } finally {
      await useFixtureCurrencyRates('exposure-integration-fixture');
      invalidateCurrentCurrencyRateCache();
    }
  });

  test('leaves archived holdings and closed positions out', async () => {
    const owner = await integration.signUp('closed');
    await addHolding(owner, { name: 'Kept Fund', price: 10, shares: 10 });
    const closed = await addHolding(owner, { name: 'Sold Fund', price: 10, shares: 5 });
    await readData(
      await integration.request('/api/investments/holding-transactions', {
        method: 'POST',
        cookie: owner.cookie,
        json: { holdingId: closed, type: 'sell', shares: 5, price: 11, date: '2026-02-01' },
      }),
      201,
    );
    const archived = await addHolding(owner, { name: 'Archived Fund', price: 10, shares: 5 });
    await integration.request(`/api/investments/holdings/${archived}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    const { view } = await getReport(owner);
    expect(view.holdings.map((h) => h.name)).toEqual(['Kept Fund']);
  });
});

describe('the Overview', () => {
  test('answers an empty account honestly', async () => {
    const { household } = await getReport(await integration.signUp('overview-empty'));
    expect(household.status).toBe('empty');
    expect(household.totalValue).toBe(0);
  });

  test("counts joint rows at the person's share and keeps a partner's private rows out", async () => {
    const owner = await integration.signUp('overview-owner');
    const partner = await integration.signUp('overview-partner');
    await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
    await addHolding(owner, { name: 'Owner Holding', price: 10, shares: 10 });
    await addHolding(partner, { name: 'Partner Holding', price: 20, shares: 10 });
    await addSavings(owner, { name: 'Owner Account', balance: 1_000 });
    await addSavings(partner, { name: 'Partner Joint', balance: 3_000.01, isJoint: true });
    await addSavings(partner, { name: 'Partner Private', balance: 9_000 });
    await addProperty(owner, {
      address: '1 Joint Lane',
      value: 300_000,
      isJoint: true,
      debt: 100_000,
    });
    await addProperty(partner, { address: '2 Private Lane', value: 500_000 });

    const report = await getReport(owner);
    const { household, facts } = report;
    expect(household.savingsValue).toBe(1_000 + 1_500.01);
    expect(household.propertyValue).toBe(100_000);
    expect(household.brokerageValue).toBe(100);
    expect(household.totalValue).toBe(102_600.01);
    expect(facts.inputs.savingsAccounts.map((row) => [row.name, row.share])).toEqual([
      ['Partner Joint', 0.5],
      ['Owner Account', 1],
    ]);
    expect(JSON.stringify(report)).not.toContain('Partner Private');
    expect(JSON.stringify(report)).not.toContain('2 Private Lane');
    expect(JSON.stringify(report)).not.toContain('Partner Holding');
  });

  test("reads no partner's private mortgage through a joint property, as net worth does", async () => {
    const owner = await integration.signUp('overview-private-debt');
    const partner = await integration.signUp('overview-private-debt-partner');
    await insertPartnerLink(owner.user.id, partner.user.id, 'accepted');
    await addProperty(partner, {
      address: '4 Joint Lane',
      value: 300_000,
      isJoint: true,
      debt: 100_000,
    });
    await db.update(mortgages).set({ isJoint: false }).where(eq(mortgages.userId, partner.user.id));

    const report = await getReport(owner);
    expect(report.facts.inputs.properties[0]).toMatchObject({ mortgage: null, valueEur: 150_000 });
    const dashboard = await readData<{ allocations: { key: string; value: number }[] }>(
      await integration.request('/api/dashboard/allocations', { cookie: owner.cookie }),
    );
    expect(report.household.propertyValue).toBe(
      dashboard.allocations.find((row) => row.key === 'property_equity')!.value,
    );
  });

  test('stops counting a joint row when the partner link is gone', async () => {
    const owner = await integration.signUp('overview-unlinked');
    const partner = await integration.signUp('overview-unlinked-partner');
    await addSavings(partner, { name: 'Partner Joint', balance: 3_000 });
    const { household } = await getReport(owner);
    expect(household.status).toBe('empty');
  });

  test('keeps negative equity in the total and out of the shares', async () => {
    const owner = await integration.signUp('overview-negative');
    await addSavings(owner, { name: 'Owner Account', balance: 10_000 });
    await addProperty(owner, {
      address: '3 Underwater Court',
      value: 100_000,
      currency: 'GBP',
      debt: 110_000,
    });
    const { household } = await getReport(owner);
    expect(household.negative).toEqual([
      expect.objectContaining({
        kind: 'property',
        name: '3 Underwater Court',
        currency: 'GBP',
        nativeValue: -10_000,
        value: -11_800,
      }),
    ]);
    expect(household.totalValue).toBe(-1_800);
    expect(household.grossValue).toBe(10_000);
    expect(household.groups.find((group) => group.key === 'cash')?.share).toBe(100);
  });

  test('leaves archived accounts out, and pensions are not part of it', async () => {
    const owner = await integration.signUp('overview-archived');
    await addSavings(owner, { name: 'Kept', balance: 100 });
    const archived = await addSavings(owner, { name: 'Archived', balance: 900 });
    await db
      .update(savingsAccounts)
      .set({ archivedAt: new Date() })
      .where(eq(savingsAccounts.id, archived));
    await readData(
      await integration.request('/api/pensions/pots', {
        method: 'POST',
        cookie: owner.cookie,
        json: {
          name: 'Pension',
          provider: 'Synthetic Provider',
          type: 'Workplace Pension',
          balance: 50_000,
          currency: 'EUR',
          employeeMonthly: 0,
          employerMonthly: 0,
          investmentStrategy: 'Balanced',
          color: '#1d4ed8',
          emoji: 'P',
        },
      }),
      201,
    );
    const { household } = await getReport(owner);
    expect(household.totalValue).toBe(100);
    expect(household.counts.savingsAccounts).toBe(1);
  });

  test('excludes an account with no stored rate instead of converting it 1:1', async () => {
    const owner = await integration.signUp('overview-missing-rate');
    await addSavings(owner, { name: 'Euro Account', balance: 100 });
    await addSavings(owner, { name: 'Swiss Account', balance: 100, currency: 'CHF' });
    await db.delete(currencyRates).where(eq(currencyRates.fromCurrency, 'CHF'));
    invalidateCurrentCurrencyRateCache();
    try {
      const { household, facts } = await getReport(owner);
      expect(household.totalValue).toBe(100);
      expect(household.excluded).toEqual([
        expect.objectContaining({ kind: 'savings', name: 'Swiss Account', reason: 'no_fx_rate' }),
      ]);
      expect(facts.householdWarnings).toContainEqual({
        code: 'fx_rate_missing',
        subject: 'fx:CHF',
      });
    } finally {
      await useFixtureCurrencyRates('exposure-integration-fixture');
      invalidateCurrentCurrencyRateCache();
    }
  });
});

describe('holding classification', () => {
  test('stores an asset class and a fund risk class on create and patch, and clears them with null', async () => {
    const owner = await integration.signUp('classify');
    const id = await addHolding(owner, {
      name: 'Tagged',
      price: 10,
      shares: 1,
      assetClass: 'gold_commodities',
      riskClassOverride: 6,
    });
    const patch = (json: unknown) =>
      integration.request(`/api/investments/holdings/${id}`, {
        method: 'PATCH',
        cookie: owner.cookie,
        json,
      });
    const stored = await readData<{ assetClass: string | null; riskClassOverride: number | null }>(
      await integration.request(`/api/investments/holdings/${id}`, { cookie: owner.cookie }),
    );
    expect(stored).toMatchObject({ assetClass: 'gold_commodities', riskClassOverride: 6 });
    expect((await patch({ name: 'Renamed' })).status).toBe(200);
    expect((await patch({ assetClass: 'bonds' })).status).toBe(400);
    expect((await patch({ riskClassOverride: 8 })).status).toBe(400);
    expect((await patch({ riskClassOverride: 0 })).status).toBe(400);
    expect((await patch({ riskClassOverride: 2.5 })).status).toBe(400);
    const kept = await readData<{ assetClass: string | null; riskClassOverride: number | null }>(
      await integration.request(`/api/investments/holdings/${id}`, { cookie: owner.cookie }),
    );
    expect(kept).toMatchObject({ assetClass: 'gold_commodities', riskClassOverride: 6 });
    expect((await patch({ assetClass: null, riskClassOverride: null })).status).toBe(200);
    const cleared = await readData<{ assetClass: string | null; riskClassOverride: number | null }>(
      await integration.request(`/api/investments/holdings/${id}`, { cookie: owner.cookie }),
    );
    expect(cleared).toMatchObject({ assetClass: null, riskClassOverride: null });
  });

  test('assigns several holdings at once, all or none', async () => {
    const owner = await integration.signUp('bulk-owner');
    const stranger = await integration.signUp('bulk-stranger');
    const first = await addHolding(owner, { name: 'Bulk One', price: 10, shares: 1 });
    const second = await addHolding(owner, { name: 'Bulk Two', price: 10, shares: 1 });
    const foreign = await addHolding(stranger, { name: 'Not Yours', price: 10, shares: 1 });
    const classify = (session: AuthSession, json: unknown) =>
      integration.request('/api/exposure/classification', {
        method: 'PATCH',
        cookie: session.cookie,
        json,
      });

    const done = await readData<
      { id: number; assetClass: string | null; riskClassOverride: number | null }[]
    >(
      await classify(owner, {
        updates: [
          { id: first, assetClass: 'bond_short_government' },
          { id: second, assetClass: 'crypto', riskClassOverride: 7 },
        ],
      }),
    );
    expect(done).toEqual([
      { id: first, assetClass: 'bond_short_government', riskClassOverride: null },
      { id: second, assetClass: 'crypto', riskClassOverride: 7 },
    ]);

    // One holding that is not the caller's fails the whole request, with the not-found answer.
    const refused = await classify(owner, {
      updates: [
        { id: first, assetClass: 'other' },
        { id: foreign, assetClass: 'other' },
      ],
    });
    expect(refused.status).toBe(404);
    const unchanged = await getReport(owner);
    expect(unchanged.view.holdings.find((h) => h.id === first)?.assetClass).toBe(
      'bond_short_government',
    );
    const strangerRows = await db.select().from(holdings).where(eq(holdings.id, foreign));
    expect(strangerRows[0]?.assetClass).toBeNull();

    for (const bad of [
      {},
      { updates: [] },
      { updates: [{ id: first }] },
      { updates: [{ id: first, assetClass: 'bonds' }] },
      { updates: [{ id: first, assetClass: 'other', riskClassOverride: 9 }] },
      { updates: [{ id: first, assetClass: 'other', userId: stranger.user.id }] },
      {
        updates: [
          { id: first, assetClass: 'other' },
          { id: first, assetClass: 'crypto' },
        ],
      },
      { updates: [{ id: 'x', assetClass: 'other' }] },
      { updates: [{ id: first, assetClass: 'other' }], extra: true },
    ]) {
      expect((await classify(owner, bad)).status).toBe(400);
    }
    expect((await classify(owner, { updates: [{ id: first, assetClass: null }] })).status).toBe(
      200,
    );
  });
});

describe('exposure settings', () => {
  test('save, apply and reset to the defaults', async () => {
    const owner = await integration.signUp('settings');
    await addHolding(owner, {
      name: 'Heavy One',
      price: 100,
      shares: 6,
      assetClass: 'equity_developed',
    });
    await addHolding(owner, { name: 'Light One', price: 100, shares: 4, assetClass: 'crypto' });

    const before = await getReport(owner);
    expect(before.settings).toMatchObject({ source: 'default', storedInvalid: false });
    expect(before.view.notices.map((n) => n.id)).toContain('single_holding');
    expect(before.view.referenceMix).toBeNull();

    const custom = defaultExposureSettings();
    custom.thresholds.singleHoldingPct = 90;
    custom.selectedMix = 'C';
    custom.riskByAssetClass.equity_developed = 6;
    const saved = await readData<ExposureReport['settings']>(
      await integration.request('/api/exposure/settings', {
        method: 'PUT',
        cookie: owner.cookie,
        json: custom,
      }),
    );
    expect(saved).toMatchObject({ source: 'custom', storedInvalid: false });

    const after = await getReport(owner);
    expect(after.settings.settings.thresholds.singleHoldingPct).toBe(90);
    expect(after.view.notices.map((n) => n.id)).not.toContain('single_holding');
    expect(after.view.referenceMix).toEqual({ id: 'C', name: 'Reference mix C' });
    expect(after.view.risk?.average).toBe(6.4);
    expect(after.facts.settings.source).toBe('custom');
    expect(after.facts.facts.every((fact) => fact.settingsVersion === 1)).toBe(true);

    const reset = await readData<ExposureReport['settings']>(
      await integration.request('/api/exposure/settings', {
        method: 'DELETE',
        cookie: owner.cookie,
      }),
    );
    expect(reset).toMatchObject({ source: 'default', updatedAt: null });
    expect(reset.settings).toEqual(defaultExposureSettings());
    expect(
      await db.select().from(exposureSettings).where(eq(exposureSettings.userId, owner.user.id)),
    ).toHaveLength(0);
    // A reset with nothing saved is still fine.
    expect(
      (
        await integration.request('/api/exposure/settings', {
          method: 'DELETE',
          cookie: owner.cookie,
        })
      ).status,
    ).toBe(200);
  });

  test('refuses settings that fail validation and stores nothing', async () => {
    const owner = await integration.signUp('settings-invalid');
    const put = (json: unknown) =>
      integration.request('/api/exposure/settings', {
        method: 'PUT',
        cookie: owner.cookie,
        json,
      });
    const bad = defaultExposureSettings();
    bad.thresholds.sectorPct = 120;
    bad.referenceMixes.B.bonds = { min: 70, max: 60 };
    bad.riskByAssetClass.crypto = 9;
    const response = await put(bad);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(
      /^Threshold for one sector must be a number from 0 to 100|^Reference mix B|^Risk class for Crypto/,
    );
    expect((await put({ ...defaultExposureSettings(), version: 2 })).status).toBe(400);
    expect((await put({ ...defaultExposureSettings(), userId: owner.user.id })).status).toBe(400);
    expect((await put('nope')).status).toBe(400);
    expect(
      await db.select().from(exposureSettings).where(eq(exposureSettings.userId, owner.user.id)),
    ).toHaveLength(0);
  });

  test('falls back to the defaults, and says so, when a stored document no longer validates', async () => {
    const owner = await integration.signUp('settings-stored-invalid');
    await db.insert(exposureSettings).values({
      userId: owner.user.id,
      settings: { version: 99 } as unknown as ExposureSettings,
    });
    const report = await getReport(owner);
    expect(report.settings).toMatchObject({ source: 'default', storedInvalid: true });
    expect(report.settings.settings).toEqual(defaultExposureSettings());
  });

  test('settings belong to one user each', async () => {
    const first = await integration.signUp('settings-first');
    const second = await integration.signUp('settings-second');
    const custom = defaultExposureSettings();
    custom.thresholds.topThreePct = 77;
    await readData(
      await integration.request('/api/exposure/settings', {
        method: 'PUT',
        cookie: first.cookie,
        json: custom,
      }),
    );
    expect((await getReport(second)).settings.settings.thresholds.topThreePct).toBe(40);
    expect((await getReport(first)).settings.settings.thresholds.topThreePct).toBe(77);
  });
});

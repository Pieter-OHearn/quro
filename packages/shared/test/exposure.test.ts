import { describe, expect, test } from 'bun:test';
import {
  ASSET_CLASSES,
  EXPOSURE_DEFAULTS_VERSION,
  EXPOSURE_DEFAULT_SOURCES,
  buildExposureView,
  computeExposureFacts,
  defaultExposureSettings,
  formatShare,
  parseExposureSettings,
  suggestAssetClass,
  type ExposureFxInput,
  type ExposureHoldingInput,
  type ExposureInput,
  type ExposureSettings,
} from '../src/index';

function holding(overrides: Partial<ExposureHoldingInput> & { id: number }): ExposureHoldingInput {
  return {
    name: `Holding ${overrides.id}`,
    ticker: `H${overrides.id}`,
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
    ...overrides,
  };
}

const USD: ExposureFxInput = {
  currency: 'USD',
  rate: 0.8,
  sourceDate: '2026-10-09',
  updatedAt: '2026-10-09T18:00:00.000Z',
  stale: false,
};
const GBP: ExposureFxInput = { ...USD, currency: 'GBP', rate: 1.2 };

function run(
  holdings: ExposureHoldingInput[],
  options: { fx?: ExposureFxInput[]; settings?: ExposureSettings } = {},
) {
  const input: ExposureInput = {
    asOf: '2026-10-09',
    baseCurrency: 'EUR',
    settings: options.settings ?? defaultExposureSettings(),
    settingsSource: 'default',
    holdings,
    fxRates: options.fx ?? [USD, GBP],
  };
  return computeExposureFacts(input);
}

function fact(facts: ReturnType<typeof run>, id: string) {
  const found = facts.facts.find((entry) => entry.id === id);
  if (!found) throw new Error(`No fact ${id}`);
  return found;
}

describe('exposure facts', () => {
  test('sums holdings in cents and gives each fact its inputs, method and settings version', () => {
    const facts = run([
      holding({ id: 1, shares: 3, unitPrice: 33.333333 }),
      holding({ id: 2, shares: 2, unitPrice: 50.005, assetClass: 'bond_investment_grade' }),
    ]);
    const total = fact(facts, 'exposure.total_value');
    expect(total.value).toBe(200.01);
    expect(total.unit).toBe('EUR');
    expect(total.inputs.map((input) => input.ref)).toEqual(['holding:2', 'holding:1']);
    expect(total.method).toEqual({ id: 'sum_cents', version: '1' });
    expect(total.settingsVersion).toBe(1);
    for (const entry of facts.facts) {
      expect(entry.id).toMatch(/^exposure\./);
      expect(entry.method.version).toBe('1');
      expect(entry.settingsVersion).toBe(1);
    }
    expect(facts.method).toEqual({ id: 'exposure-breakdown', version: '1.0.0' });
    expect(facts.settings.defaultsVersion).toBe(EXPOSURE_DEFAULTS_VERSION);
  });

  test('is deterministic and survives a JSON round trip into the same view', () => {
    const holdings = [
      holding({ id: 1, currency: 'USD', sector: 'Technology', unitPrice: 187.2, shares: 6 }),
      holding({ id: 2, assetClass: null, unitPrice: 12.5 }),
      holding({ id: 3, currency: 'GBP', unitPrice: 18.75, shares: 150 }),
    ];
    const first = run(holdings);
    const second = run(holdings);
    expect(second).toEqual(first);
    const revived = JSON.parse(JSON.stringify(first));
    expect(buildExposureView(revived)).toEqual(buildExposureView(first));
  });

  test('converts a foreign holding at the given rate and records the rate and its date', () => {
    const facts = run([holding({ id: 1, currency: 'USD', shares: 10, unitPrice: 100 })]);
    expect(fact(facts, 'exposure.total_value').value).toBe(800);
    const fx = fact(facts, 'exposure.total_value').inputs.find((input) => input.ref === 'fx:USD');
    expect(fx).toEqual({ ref: 'fx:USD', value: 0.8, unit: 'rate', date: '2026-10-09' });
    expect(facts.inputs.holdings[0]).toMatchObject({
      nativeValue: 1000,
      fxRate: 0.8,
      valueEur: 800,
    });
    expect(facts.inputs.fxRates.map((rate) => rate.currency)).toEqual(['USD']);
  });

  test('excludes a holding whose currency has no rate instead of guessing 1:1', () => {
    const facts = run(
      [holding({ id: 1 }), holding({ id: 2, currency: 'CHF', unitPrice: 500, shares: 100 })],
      { fx: [USD] },
    );
    expect(fact(facts, 'exposure.total_value').value).toBe(1000);
    const excluded = facts.inputs.holdings.find((entry) => entry.id === 2);
    expect(excluded).toMatchObject({
      status: 'excluded',
      excludedReason: 'no_fx_rate',
      valueEur: null,
    });
    expect(facts.warnings).toContainEqual({ code: 'fx_rate_missing', subject: 'fx:CHF' });
    const view = buildExposureView(facts);
    expect(view.excluded.map((row) => row.reason)).toEqual(['no_fx_rate']);
    expect(view.holdings).toHaveLength(1);
  });

  test('excludes missing, zero and negative prices and names them', () => {
    const facts = run([
      holding({ id: 1 }),
      holding({ id: 2, unitPrice: null }),
      holding({ id: 3, unitPrice: 0 }),
      holding({ id: 4, unitPrice: -5 }),
    ]);
    expect(fact(facts, 'exposure.total_value').value).toBe(1000);
    expect(facts.warnings.filter((w) => w.code === 'price_missing').map((w) => w.subject)).toEqual([
      'holding:2',
      'holding:3',
      'holding:4',
    ]);
  });

  test('leaves closed holdings out entirely', () => {
    const facts = run([holding({ id: 1 }), holding({ id: 2, shares: 0 })]);
    expect(facts.inputs.holdings.map((entry) => entry.id)).toEqual([1]);
  });

  test('reports a portfolio of nothing as empty, with zero and no ratios', () => {
    const facts = run([holding({ id: 1, shares: 0 })]);
    expect(fact(facts, 'exposure.total_value').value).toBe(0);
    expect(facts.facts).toHaveLength(1);
    expect(facts.warnings).toContainEqual({ code: 'nothing_to_value', subject: 'portfolio' });
    const view = buildExposureView(facts);
    expect(view.status).toBe('empty');
    expect(view.risk).toBeNull();
    expect(view.statement).toBeNull();
    expect(view.effectiveHoldings).toBeNull();
  });

  test('treats holdings worth less than a cent as nothing to break down', () => {
    const facts = run([holding({ id: 1, shares: 1, unitPrice: 0.001 })]);
    expect(fact(facts, 'exposure.total_value').value).toBe(0);
    expect(facts.warnings).toContainEqual({ code: 'nothing_to_value', subject: 'portfolio' });
    expect(buildExposureView(facts).status).toBe('empty');
  });

  test('is unvaluable, not empty, when every holding lacks a price', () => {
    const view = buildExposureView(run([holding({ id: 1, unitPrice: null })]));
    expect(view.status).toBe('unvaluable');
    expect(view.excluded).toHaveLength(1);
  });

  test('collects unclassified holdings in their own bucket', () => {
    const facts = run([holding({ id: 1 }), holding({ id: 2, assetClass: null })]);
    expect(fact(facts, 'exposure.asset_class.unclassified.share').value).toBe(50);
    expect(fact(facts, 'exposure.asset_class.unclassified.share').warnings).toContain(
      'unclassified',
    );
    expect(facts.warnings).toContainEqual({ code: 'unclassified_holdings', subject: 'portfolio' });
    const view = buildExposureView(facts);
    expect(view.unclassified).toEqual({ value: 1000, share: 50, holdingCount: 1 });
    expect(view.assetClasses.map((row) => row.key).sort()).toEqual([
      'equity_developed',
      'unclassified',
    ]);
  });

  test('flags stale prices and stale rates on the facts that use them', () => {
    const facts = run([holding({ id: 1, priceStale: true }), holding({ id: 2, currency: 'USD' })], {
      fx: [{ ...USD, stale: true }],
    });
    expect(fact(facts, 'exposure.total_value').warnings).toEqual(['fx_rate_stale', 'price_stale']);
    expect(fact(facts, 'exposure.holding.2.weight').warnings).toEqual(['fx_rate_stale']);
    expect(facts.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['price_stale', 'fx_rate_stale']),
    );
  });

  test('computes shares by asset class, group, currency and sector', () => {
    const facts = run([
      holding({ id: 1, assetClass: 'equity_developed', sector: 'Technology', shares: 6 }),
      holding({ id: 2, assetClass: 'bond_long_government', sector: 'Government', shares: 3 }),
      holding({ id: 3, assetClass: 'crypto', sector: 'Crypto', currency: 'USD', shares: 1.25 }),
    ]);
    expect(fact(facts, 'exposure.asset_class.equity_developed.share').value).toBe(60);
    expect(fact(facts, 'exposure.group.stocks.share').value).toBe(60);
    expect(fact(facts, 'exposure.group.bonds.share').value).toBe(30);
    expect(fact(facts, 'exposure.group.other.share').value).toBe(10);
    expect(fact(facts, 'exposure.group.cash.share').value).toBe(0);
    expect(fact(facts, 'exposure.currency.USD.share').value).toBe(10);
    expect(fact(facts, 'exposure.sector.technology.share').value).toBe(60);
    const view = buildExposureView(facts);
    expect(view.statement).toBe('Stocks are 60% of your investments');
  });

  test('puts a share of 0 in empty groups and keeps shares of one decimal', () => {
    const view = buildExposureView(
      run([
        holding({ id: 1, shares: 1, unitPrice: 333 }),
        holding({ id: 2, assetClass: 'bond_high_yield', shares: 1, unitPrice: 667 }),
      ]),
    );
    expect(view.groups.map((g) => [g.key, g.share])).toEqual([
      ['stocks', 33.3],
      ['bonds', 66.7],
      ['cash', 0],
      ['other', 0],
    ]);
    expect(view.statement).toBe('Bonds are 66.7% of your investments');
  });
});

describe('exposure concentration', () => {
  test('effective number of holdings is 1 over the sum of squared weights', () => {
    const ten = run(Array.from({ length: 10 }, (_, index) => holding({ id: index + 1 })));
    expect(fact(ten, 'exposure.concentration.hhi').value).toBe(1000);
    expect(fact(ten, 'exposure.concentration.effective_holdings').value).toBe(10);
    const two = run([holding({ id: 1 }), holding({ id: 2 })]);
    expect(fact(two, 'exposure.concentration.effective_holdings').value).toBe(2);
    const skewed = run([holding({ id: 1, shares: 90 }), holding({ id: 2, shares: 10 })]);
    expect(fact(skewed, 'exposure.concentration.hhi').value).toBe(8200);
    expect(fact(skewed, 'exposure.concentration.effective_holdings').value).toBe(1.22);
  });

  test('raises the notices from the editable thresholds and words them as information', () => {
    const facts = run([
      holding({ id: 1, name: 'Big Fund', shares: 60, sector: 'Technology' }),
      holding({ id: 2, shares: 10, sector: 'Health', currency: 'USD' }),
      holding({ id: 3, shares: 10, sector: 'Energy' }),
      holding({ id: 4, shares: 10, sector: 'Utilities' }),
      holding({ id: 5, shares: 10, sector: 'Retail' }),
    ]);
    const view = buildExposureView(facts);
    expect(view.notices.map((notice) => notice.id)).toEqual([
      'single_holding',
      'top_three',
      'sector',
    ]);
    expect(view.notices[0].message).toContain('Big Fund holds');
    expect(view.notices[0].message).toContain('Many sources treat more than 10% in one holding');
    for (const notice of view.notices) {
      expect(notice.message).not.toMatch(/should|buy|sell|recommend/i);
    }
  });

  test("uses the person's thresholds and says so", () => {
    const settings = defaultExposureSettings();
    settings.thresholds.singleHoldingPct = 70;
    const none = buildExposureView(
      run([holding({ id: 1, shares: 60 }), holding({ id: 2, shares: 40 })], { settings }),
    );
    expect(none.notices.map((notice) => notice.id)).not.toContain('single_holding');
    settings.thresholds.singleHoldingPct = 55;
    const some = buildExposureView(
      run([holding({ id: 1, shares: 60 }), holding({ id: 2, shares: 40 })], { settings }),
    );
    expect(some.notices[0].message).toContain('Your notice threshold for one holding is 55%');
  });

  test('does not call a fund sector such as Diversified concentrated', () => {
    const view = buildExposureView(
      run([holding({ id: 1, shares: 50 }), holding({ id: 2, shares: 50 })]),
    );
    expect(view.sectors).toEqual([
      expect.objectContaining({ label: 'Diversified', generic: true }),
    ]);
    expect(view.notices.map((notice) => notice.id)).not.toContain('sector');
  });

  test('keeps the currency notice off by default and still shows the currency breakdown', () => {
    const holdings = [
      holding({ id: 1, shares: 10 }),
      holding({ id: 2, currency: 'USD', shares: 30, unitPrice: 100 }),
    ];
    const view = buildExposureView(run(holdings));
    expect(view.notices.map((notice) => notice.id)).not.toContain('currency');
    expect(view.currencies.map((row) => row.key)).toEqual(['USD', 'EUR']);
    expect(defaultExposureSettings().noticesEnabled.currencyPct).toBe(false);
  });

  test('flags the largest currency outside EUR once the notice is switched on', () => {
    const settings = defaultExposureSettings();
    settings.noticesEnabled.currencyPct = true;
    const small = buildExposureView(
      run(
        [
          holding({ id: 1, shares: 10 }),
          holding({ id: 2, currency: 'USD', shares: 20, unitPrice: 100 }),
          holding({ id: 3, currency: 'GBP', shares: 5, unitPrice: 100 }),
        ],
        { settings },
      ),
    );
    // USD is 1600 of 3200 EUR = 50%, which is not above the 50% threshold.
    expect(small.notices.map((notice) => notice.id)).not.toContain('currency');
    const above = buildExposureView(
      run(
        [
          holding({ id: 1, shares: 10 }),
          holding({ id: 2, currency: 'USD', shares: 30, unitPrice: 100 }),
        ],
        { settings },
      ),
    );
    const notice = above.notices.find((entry) => entry.id === 'currency');
    expect(notice?.message).toContain('70.6% of your portfolio is in USD, outside EUR');
  });

  test('a switched-off notice is not raised and its check says it is off', () => {
    const settings = defaultExposureSettings();
    settings.noticesEnabled.singleHoldingPct = false;
    const facts = run([holding({ id: 1, shares: 90 }), holding({ id: 2, shares: 10 })], {
      settings,
    });
    const check = fact(facts, 'exposure.check.single_holding');
    expect(check.value).toBe(false);
    expect(check.context).toMatchObject({ enabled: false, measured: 90 });
    expect(buildExposureView(facts).notices.map((notice) => notice.id)).not.toContain(
      'single_holding',
    );
  });

  test('skips the top-three and spread notices for a very small portfolio', () => {
    const view = buildExposureView(run([holding({ id: 1 })]));
    expect(view.notices.map((notice) => notice.id)).toEqual(['single_holding']);
  });
});

describe('exposure risk', () => {
  test("weights default risk classes by value and uses a fund's own class over the default", () => {
    const facts = run([
      holding({ id: 1, assetClass: 'equity_developed', shares: 5 }),
      holding({ id: 2, assetClass: 'bond_short_government', shares: 5 }),
    ]);
    // (4 + 2) / 2 = 3
    const risk = fact(facts, 'exposure.risk.weighted_average');
    expect(risk.value).toBe(3);
    expect(risk.context).toMatchObject({ band: 'Low to medium', roundedClass: 3 });
    const overridden = run([
      holding({ id: 1, assetClass: 'equity_developed', shares: 5, riskClassOverride: 6 }),
      holding({ id: 2, assetClass: 'bond_short_government', shares: 5 }),
    ]);
    expect(fact(overridden, 'exposure.risk.weighted_average').value).toBe(4);
    expect(buildExposureView(overridden).holdings.find((h) => h.id === 1)?.riskSource).toBe(
      'override',
    );
  });

  test('leaves unrated holdings out of the average and reports how much it covers', () => {
    const facts = run([
      holding({ id: 1, assetClass: 'crypto', shares: 5 }),
      holding({ id: 2, assetClass: null, shares: 5 }),
    ]);
    const risk = buildExposureView(facts).risk;
    expect(risk).toMatchObject({ average: 7, roundedClass: 7, band: 'Very high', coverage: 50 });
    expect(risk?.holdingsWithoutRiskClass).toBe(1);
    expect(fact(facts, 'exposure.risk.weighted_average').warnings).toContain(
      'holdings_without_risk_class',
    );
  });

  test('has no average when nothing has a risk class', () => {
    const view = buildExposureView(run([holding({ id: 1, assetClass: null })]));
    expect(view.risk).toBeNull();
  });
});

describe('exposure reference mix', () => {
  test('compares each group with the selected mix and states it without advice', () => {
    const settings = defaultExposureSettings();
    settings.selectedMix = 'B';
    const view = buildExposureView(
      run(
        [
          holding({ id: 1, assetClass: 'bond_long_government', shares: 62 }),
          holding({ id: 2, assetClass: 'equity_developed', shares: 38 }),
        ],
        { settings },
      ),
    );
    expect(view.referenceMix).toEqual({ id: 'B', name: 'Reference mix B' });
    expect(view.groups[0].reference).toEqual({ min: 40, max: 60, status: 'below' });
    expect(view.groups[1].reference).toEqual({ min: 35, max: 55, status: 'above' });
    expect(view.referenceStatement).toBe(
      'Compared with Reference mix B: stocks are below the range of 40 to 60%, bonds are above the range of 35 to 55%. Unclassified holdings are not part of any group.',
    );
    expect(view.statement).toBe('Bonds are 62% of your investments');
    expect(`${view.statement} ${view.referenceStatement}`).not.toMatch(
      /should|buy|sell|recommend/i,
    );
  });

  test('draws nothing when no mix is selected', () => {
    const view = buildExposureView(run([holding({ id: 1 })]));
    expect(view.referenceMix).toBeNull();
    expect(view.referenceStatement).toBeNull();
    expect(view.groups.every((group) => group.reference === null)).toBe(true);
  });
});

describe('exposure settings', () => {
  test('defaults are valid and every default has a source and a version date', () => {
    const parsed = parseExposureSettings(defaultExposureSettings());
    expect(parsed.ok).toBe(true);
    for (const source of EXPOSURE_DEFAULT_SOURCES) {
      expect(source.source.length).toBeGreaterThan(10);
      expect(source.versionDate.length).toBeGreaterThan(3);
      expect(['published', 'assumption']).toContain(source.basis);
    }
    for (const assetClass of ASSET_CLASSES) {
      expect(EXPOSURE_DEFAULT_SOURCES.some((s) => s.id === `risk.${assetClass}`)).toBe(true);
    }
    expect(defaultExposureSettings().selectedMix).toBeNull();
  });

  test('returns a copy, so editing one never changes the defaults', () => {
    const first = defaultExposureSettings();
    first.thresholds.singleHoldingPct = 99;
    first.referenceMixes.A.stocks.max = 1;
    expect(defaultExposureSettings().thresholds.singleHoldingPct).toBe(10);
    expect(defaultExposureSettings().referenceMixes.A.stocks.max).toBe(40);
  });

  test('refuses percentages outside 0 to 100, unordered ranges and risk outside 1 to 7', () => {
    const settings = defaultExposureSettings();
    settings.thresholds.sectorPct = 101;
    settings.referenceMixes.A.stocks = { min: 50, max: 40 };
    settings.riskByAssetClass.crypto = 8;
    const result = parseExposureSettings(settings);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain(
      'Threshold for one sector must be a number from 0 to 100',
    );
    expect(result.errors.join(' ')).toContain('minimum cannot be above its maximum');
    expect(result.errors.join(' ')).toContain(
      'Risk class for Crypto must be a whole number from 1 to 7',
    );
  });

  test('refuses a mix that cannot add up to 100%, unknown keys and a wrong version', () => {
    const settings = defaultExposureSettings();
    settings.referenceMixes.C.stocks = { min: 90, max: 95 };
    settings.referenceMixes.C.bonds = { min: 20, max: 30 };
    expect(parseExposureSettings(settings).ok).toBe(false);
    expect(parseExposureSettings({ ...defaultExposureSettings(), extra: 1 }).ok).toBe(false);
    expect(parseExposureSettings({ ...defaultExposureSettings(), version: 2 }).ok).toBe(false);
    expect(parseExposureSettings({ ...defaultExposureSettings(), selectedMix: 'E' }).ok).toBe(
      false,
    );
    expect(parseExposureSettings(null).ok).toBe(false);
    const fractional = defaultExposureSettings();
    fractional.riskByAssetClass.cash_money_market = 1.5;
    expect(parseExposureSettings(fractional).ok).toBe(false);
  });

  test('refuses a notice switch that is not a boolean, and a missing or unknown one', () => {
    const settings = defaultExposureSettings() as unknown as Record<string, unknown>;
    expect(
      parseExposureSettings({
        ...settings,
        noticesEnabled: { ...(settings.noticesEnabled as object), currencyPct: 'yes' },
      }).ok,
    ).toBe(false);
    expect(parseExposureSettings({ ...settings, noticesEnabled: undefined }).ok).toBe(false);
    expect(
      parseExposureSettings({
        ...settings,
        noticesEnabled: { ...(settings.noticesEnabled as object), extra: true },
      }).ok,
    ).toBe(false);
    const on = defaultExposureSettings();
    on.noticesEnabled.currencyPct = true;
    expect(parseExposureSettings(on)).toEqual({ ok: true, value: on });
  });

  test('allows an unrated class and rounds percentages to two decimals', () => {
    const settings = defaultExposureSettings();
    settings.thresholds.topThreePct = 41.666;
    settings.riskByAssetClass.crypto = null;
    const parsed = parseExposureSettings(settings);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.thresholds.topThreePct).toBe(41.67);
    expect(parsed.value.riskByAssetClass.crypto).toBeNull();
  });

  test('a changed risk mapping changes the average', () => {
    const settings = defaultExposureSettings();
    settings.riskByAssetClass.equity_developed = 6;
    const facts = run([holding({ id: 1 })], { settings });
    expect(fact(facts, 'exposure.risk.weighted_average').value).toBe(6);
  });
});

describe('asset class suggestions', () => {
  const CASES: [string, { name: string; itemType?: string }, string][] = [
    ['money market', { name: 'Sample Money Market Fund', itemType: 'fund' }, 'cash_money_market'],
    ['gold', { name: 'Example Gold ETC', itemType: 'etf' }, 'gold_commodities'],
    ['crypto', { name: 'Example Bitcoin Trust' }, 'crypto'],
    ['emerging', { name: 'Example Emerging Markets Fund' }, 'equity_emerging'],
    ['short government', { name: 'Example Euro Government Bond 1-3' }, 'bond_short_government'],
    ['government', { name: 'Example Government Bond ETF' }, 'bond_long_government'],
    ['corporate', { name: 'Example Corporate Bond Fund' }, 'bond_investment_grade'],
    ['high yield', { name: 'Example High Yield Bond Fund' }, 'bond_high_yield'],
    ['share', { name: 'Fictional Retail Group', itemType: 'equity' }, 'equity_developed'],
    ['equity fund', { name: 'Example Global Equity ETF' }, 'equity_developed'],
  ];

  for (const [label, input, expected] of CASES) {
    test(`suggests ${expected} for ${label} and says why`, () => {
      const suggestion = suggestAssetClass(input);
      expect(suggestion?.assetClass).toBe(expected as never);
      expect(suggestion?.reason.length).toBeGreaterThan(5);
    });
  }

  test('suggest nothing when the holding says too little', () => {
    expect(
      suggestAssetClass({ name: 'Sample US Tech Fund', sector: 'Technology', itemType: 'fund' }),
    ).toBeNull();
    expect(suggestAssetClass({})).toBeNull();
  });
});

test('formatShare drops a trailing zero decimal', () => {
  expect(formatShare(62)).toBe('62%');
  expect(formatShare(62.04)).toBe('62%');
  expect(formatShare(33.3)).toBe('33.3%');
});

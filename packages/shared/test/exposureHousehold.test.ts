import { describe, expect, test } from 'bun:test';
import {
  buildExposureHouseholdView,
  buildExposureView,
  computeExposureFacts,
  defaultExposureSettings,
  sumMoney,
  type ExposureFacts,
  type ExposureFxInput,
  type ExposureHoldingInput,
  type ExposureInput,
  type ExposurePropertyInput,
  type ExposureSavingsInput,
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

function savings(overrides: Partial<ExposureSavingsInput> & { id: number }): ExposureSavingsInput {
  return {
    name: `Account ${overrides.id}`,
    bank: 'Example Bank',
    currency: 'EUR',
    balance: 1000,
    isJoint: false,
    ...overrides,
  };
}

function property(
  overrides: Partial<ExposurePropertyInput> & { id: number },
): ExposurePropertyInput {
  return {
    name: `${overrides.id} Example Street`,
    propertyType: 'Primary Residence',
    currency: 'EUR',
    currentValue: 200_000,
    isJoint: false,
    mortgage: null,
    ...overrides,
  };
}

const GBP: ExposureFxInput = {
  currency: 'GBP',
  rate: 1.2,
  sourceDate: '2026-10-09',
  updatedAt: '2026-10-09T18:00:00.000Z',
  stale: false,
};

function run(input: Partial<ExposureInput> = {}): ExposureFacts {
  return computeExposureFacts({
    asOf: '2026-10-09',
    baseCurrency: 'EUR',
    settings: defaultExposureSettings(),
    settingsSource: 'default',
    holdings: [],
    fxRates: [GBP],
    ...input,
  });
}

function fact(facts: ExposureFacts, id: string) {
  const found = facts.facts.find((entry) => entry.id === `exposure.household.${id}`);
  if (!found) throw new Error(`No fact ${id}`);
  return found;
}

describe('household positions', () => {
  test('a joint account counts at 50% and says so', () => {
    const facts = run({ savingsAccounts: [savings({ id: 1, balance: 3000.01, isJoint: true })] });
    const [position] = facts.inputs.savingsAccounts;
    expect(position.share).toBe(0.5);
    expect(position.nativeValue).toBeCloseTo(1500.005, 6);
    expect(position.valueEur).toBe(1500.01);
    expect(position.provenance).toEqual({ ref: 'savings:1', basis: 'balance', fxDate: null });
    expect(fact(facts, 'savings.value').value).toBe(1500.01);
  });

  test('an own account counts in full', () => {
    const facts = run({ savingsAccounts: [savings({ id: 1, balance: 2500 })] });
    expect(facts.inputs.savingsAccounts[0].share).toBe(1);
    expect(fact(facts, 'total_value').value).toBe(2500);
  });

  test('a joint property with a joint mortgage counts at half its equity', () => {
    const facts = run({
      properties: [
        property({
          id: 1,
          currentValue: 300_000,
          isJoint: true,
          mortgage: { id: 9, outstandingBalance: 100_000, isJoint: true },
        }),
      ],
    });
    const [position] = facts.inputs.properties;
    expect(position.valueEur).toBe(100_000);
    expect(position.share).toBe(0.5);
    expect(position.provenance).toEqual({
      ref: 'property:1',
      basis: 'value_less_mortgage',
      fxDate: null,
    });
  });

  test('each side of a property is weighted by its own row', () => {
    const facts = run({
      properties: [
        property({
          id: 1,
          currentValue: 300_000,
          isJoint: true,
          mortgage: { id: 9, outstandingBalance: 100_000, isJoint: false },
        }),
      ],
    });
    expect(facts.inputs.properties[0].valueEur).toBe(50_000);
  });

  test('a property without a mortgage counts at its value', () => {
    const facts = run({ properties: [property({ id: 1, currentValue: 150_000 })] });
    expect(facts.inputs.properties[0].valueEur).toBe(150_000);
    expect(facts.inputs.properties[0].provenance.basis).toBe('value');
  });

  test('a foreign account keeps its currency and converts at the stored rate, rounded once', () => {
    const facts = run({
      savingsAccounts: [savings({ id: 1, currency: 'GBP', balance: 1000.05 })],
    });
    const [position] = facts.inputs.savingsAccounts;
    expect(position.currency).toBe('GBP');
    expect(position.nativeValue).toBe(1000.05);
    expect(position.fxRate).toBe(1.2);
    expect(position.valueEur).toBe(1200.06);
    expect(position.provenance.fxDate).toBe('2026-10-09');
    expect(facts.inputs.fxRates.map((rate) => rate.currency)).toEqual(['GBP']);
  });

  test('a missing rate excludes the position with a reason, never 1:1', () => {
    const facts = run({
      savingsAccounts: [
        savings({ id: 1, balance: 500 }),
        savings({ id: 2, name: 'Swiss Pot', currency: 'CHF', balance: 9000 }),
      ],
      properties: [property({ id: 3, name: 'Chalet', currency: 'CHF', currentValue: 400_000 })],
    });
    const swiss = facts.inputs.savingsAccounts.find((row) => row.id === 2)!;
    expect(swiss).toMatchObject({
      status: 'excluded',
      excludedReason: 'no_fx_rate',
      fxRate: null,
      valueEur: null,
      nativeValue: 9000,
    });
    expect(fact(facts, 'total_value').value).toBe(500);
    expect(facts.householdWarnings).toContainEqual({ code: 'fx_rate_missing', subject: 'fx:CHF' });
    const view = buildExposureHouseholdView(facts);
    expect(view.excluded).toEqual([
      { kind: 'savings', id: 2, name: 'Swiss Pot', currency: 'CHF', reason: 'no_fx_rate' },
      { kind: 'property', id: 3, name: 'Chalet', currency: 'CHF', reason: 'no_fx_rate' },
    ]);
    expect(view.currencies.map((row) => row.key)).toEqual(['EUR']);
  });

  test('a stale rate is reported and stays in use', () => {
    const facts = run({
      fxRates: [{ ...GBP, stale: true }],
      savingsAccounts: [savings({ id: 1, currency: 'GBP' })],
    });
    expect(facts.householdWarnings).toContainEqual({ code: 'fx_rate_stale', subject: 'fx:GBP' });
    expect(fact(facts, 'savings.value').warnings).toEqual(['fx_rate_stale']);
    expect(fact(facts, 'savings.value').value).toBe(1200);
    expect(buildExposureHouseholdView(facts).staleRates.map((r) => r.currency)).toEqual(['GBP']);
  });
});

describe('the Everything view', () => {
  const facts = run({
    holdings: [
      holding({ id: 1, shares: 40 }),
      holding({ id: 2, assetClass: 'bond_long_government', shares: 10 }),
      holding({ id: 3, assetClass: 'cash_money_market', shares: 5 }),
      holding({ id: 4, name: 'Property Fund', assetClass: 'property_reits', shares: 5 }),
      holding({ id: 5, assetClass: null, shares: 5 }),
    ],
    savingsAccounts: [savings({ id: 1, balance: 3500 })],
    properties: [property({ id: 1, currentValue: 3000 })],
  });
  const view = buildExposureHouseholdView(facts);
  const group = (key: string) => view.groups.find((row) => row.key === key)!;

  test('has five groups, with cash funds and savings together', () => {
    expect(view.groups.map((row) => row.label)).toEqual([
      'Stocks',
      'Bonds',
      'Cash',
      'Property',
      'Other assets',
    ]);
    expect(group('cash').value).toBe(4000);
    expect(group('cash').share).toBe(30.77);
  });

  test('keeps a real-estate fund in its asset class group, not in Property', () => {
    expect(group('property').value).toBe(3000);
    expect(group('other').value).toBe(500);
  });

  test('counts unclassified holdings in the total and in no group', () => {
    expect(view.unclassified.value).toBe(500);
    expect(view.totalValue).toBe(13_000);
    const grouped = sumMoney(view.groups.map((row) => row.value));
    expect(grouped).toBe(12_500);
  });

  test('names the largest group as a share of the assets', () => {
    expect(view.statement).toBe('Stocks are 30.8% of your assets');
  });

  test('leaves the Investments view as it was', () => {
    const investments = buildExposureView(facts);
    const alone = buildExposureView(run({ holdings: facts.inputs.holdings }));
    expect(investments).toEqual(alone);
    expect(investments.totalValue).toBe(6500);
    expect(investments.groups.map((row) => row.key)).toEqual(['stocks', 'bonds', 'cash', 'other']);
  });

  test('takes no reference range and has no risk or concentration facts of its own', () => {
    const selected = defaultExposureSettings();
    selected.selectedMix = 'B';
    const report = run({
      settings: selected,
      holdings: [holding({ id: 1 })],
      savingsAccounts: [savings({ id: 1 })],
    });
    expect(buildExposureView(report).referenceMix?.id).toBe('B');
    const ids = report.facts.map((entry) => entry.id);
    expect(ids.filter((id) => id.startsWith('exposure.household.reference'))).toEqual([]);
    expect(ids.filter((id) => id.startsWith('exposure.household.risk'))).toEqual([]);
    expect(buildExposureHouseholdView(report).groups[0]).not.toHaveProperty('reference');
  });

  test('breaks down by native currency across every kind of position', () => {
    const report = run({
      holdings: [holding({ id: 1, shares: 10 })],
      savingsAccounts: [savings({ id: 1, currency: 'GBP', balance: 1000 })],
      properties: [property({ id: 1, currency: 'GBP', currentValue: 1000 })],
    });
    expect(buildExposureHouseholdView(report).currencies).toEqual([
      { key: 'GBP', label: 'GBP', value: 2400, share: 70.59 },
      { key: 'EUR', label: 'EUR', value: 1000, share: 29.41 },
    ]);
  });

  test('is empty with nothing counted, and ready with only savings', () => {
    const none = run();
    expect(none.facts).toHaveLength(1);
    expect(buildExposureHouseholdView(none).status).toBe('empty');
    expect(none.householdWarnings).toEqual([{ code: 'nothing_to_value', subject: 'household' }]);
    const report = run({ savingsAccounts: [savings({ id: 1 })] });
    expect(buildExposureHouseholdView(report).status).toBe('ready');
    expect(buildExposureView(report).status).toBe('empty');
  });

  test('is unvaluable when only excluded positions exist', () => {
    const report = run({ savingsAccounts: [savings({ id: 1, currency: 'CHF' })] });
    expect(buildExposureHouseholdView(report).status).toBe('unvaluable');
  });
});

describe('negative positions', () => {
  const underwater = property({
    id: 2,
    name: 'Underwater Flat',
    currency: 'GBP',
    currentValue: 100_000,
    mortgage: { id: 9, outstandingBalance: 110_000, isJoint: false },
  });
  const facts = run({
    holdings: [holding({ id: 1, shares: 100 })],
    savingsAccounts: [savings({ id: 1, balance: 10_000 })],
    properties: [property({ id: 1, currentValue: 80_000 }), underwater],
  });
  const view = buildExposureHouseholdView(facts);

  test('stay in the total and the property figure', () => {
    expect(view.negative).toEqual([
      {
        kind: 'property',
        id: 2,
        name: 'Underwater Flat',
        currency: 'GBP',
        nativeValue: -10_000,
        value: -12_000,
      },
    ]);
    expect(view.negativeValue).toBe(-12_000);
    expect(view.grossValue).toBe(100_000);
    expect(view.totalValue).toBe(88_000);
    expect(view.propertyValue).toBe(68_000);
  });

  test('are in no share, so the shares add up to 100', () => {
    expect(view.groups.every((row) => row.share >= 0)).toBe(true);
    expect(view.groups.find((row) => row.key === 'property')?.value).toBe(80_000);
    expect(view.groups.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 6);
  });

  test('are in no currency row', () => {
    expect(view.currencies.map((row) => row.key)).toEqual(['EUR']);
  });

  test('can be all there is: no shares, a total below zero', () => {
    const report = run({ properties: [underwater] });
    const alone = buildExposureHouseholdView(report);
    expect(alone.status).toBe('ready');
    expect(alone.totalValue).toBe(-12_000);
    expect(alone.groups.every((row) => row.share === 0)).toBe(true);
    expect(alone.statement).toBeNull();
  });

  test('an overdrawn account is handled like negative equity', () => {
    const report = run({
      savingsAccounts: [savings({ id: 1, balance: 1000 }), savings({ id: 2, balance: -250 })],
    });
    const overdrawn = buildExposureHouseholdView(report);
    expect(overdrawn.negative.map((row) => row.kind)).toEqual(['savings']);
    expect(overdrawn.savingsValue).toBe(750);
    expect(overdrawn.grossValue).toBe(1000);
  });
});

describe('the facts document', () => {
  test('is deterministic and every household fact has a method and inputs', () => {
    const input = {
      holdings: [holding({ id: 1 })],
      savingsAccounts: [savings({ id: 1 })],
      properties: [property({ id: 1 })],
    };
    expect(run(input)).toEqual(run(input));
    const total = fact(run(input), 'total_value');
    expect(total.kind).toBe('total');
    expect(total.method.id).toBe('sum_cents');
    expect(total.inputs.map((entry) => entry.ref)).toEqual([
      'holding:1',
      'savings:1',
      'property:1',
    ]);
  });
});

import { describe, expect, test } from 'bun:test';
import {
  buildExposureHouseholdView,
  computeExposureFacts,
  defaultExposureSettings,
  toCents,
  type ExposurePropertyInput,
  type ExposureSavingsInput,
} from '@quro/shared';
import { computeDerivedAllocations } from './netWorth';
import { scopeHouseholdRows } from './partner';

// Awkward amounts on purpose: an odd cent in a joint row, and a rate that does not divide evenly.
const RATES = new Map([
  ['EUR', 1],
  ['GBP', 1.17913],
  ['USD', 0.86127],
]);

const ACCOUNTS = [
  { id: 1, currency: 'EUR', balance: 12_345.67, isJoint: true },
  { id: 2, currency: 'GBP', balance: 1_000.01, isJoint: true },
  { id: 3, currency: 'USD', balance: 777.77, isJoint: false },
  { id: 4, currency: 'EUR', balance: -12.35, isJoint: false },
];

const MORTGAGES = [
  { id: 10, currency: 'EUR', outstandingBalance: 210_001.01, isJoint: true },
  { id: 11, currency: 'GBP', outstandingBalance: 181_000.33, isJoint: false },
  { id: 12, currency: 'EUR', outstandingBalance: 50_000.01, isJoint: false },
];

const PROPERTIES = [
  { id: 1, currency: 'EUR', currentValue: 395_000.33, isJoint: true, mortgageId: 10 },
  { id: 2, currency: 'GBP', currentValue: 178_000.11, isJoint: false, mortgageId: 11 },
  { id: 3, currency: 'USD', currentValue: 90_000.55, isJoint: false, mortgageId: null },
  // Joint value, private debt: each side at its own row's share.
  { id: 4, currency: 'EUR', currentValue: 120_000.01, isJoint: true, mortgageId: 12 },
  // The link points at a mortgage the person cannot read: no debt, as in net worth.
  { id: 5, currency: 'EUR', currentValue: 10_000.03, isJoint: false, mortgageId: 99 },
];

function dashboardFigures() {
  const summary = computeDerivedAllocations(
    RATES,
    scopeHouseholdRows('savings', ACCOUNTS, (row) => row.isJoint),
    [],
    [],
    scopeHouseholdRows('properties', PROPERTIES, (row) => row.isJoint),
    [],
    scopeHouseholdRows('mortgages', MORTGAGES, (row) => row.isJoint),
    [],
  );
  const value = (key: string) => summary.allocations.find((item) => item.key === key)!.value;
  return { savings: value('savings'), propertyEquity: value('property_equity') };
}

function overview() {
  const savingsAccounts: ExposureSavingsInput[] = ACCOUNTS.map((row) => ({
    ...row,
    name: `Account ${row.id}`,
    bank: 'Example Bank',
  }));
  const properties: ExposurePropertyInput[] = PROPERTIES.map(({ mortgageId, ...row }) => ({
    ...row,
    name: `${row.id} Example Street`,
    propertyType: 'Primary Residence',
    mortgage: MORTGAGES.find((mortgage) => mortgage.id === mortgageId) ?? null,
  }));
  return buildExposureHouseholdView(
    computeExposureFacts({
      asOf: '2026-10-09',
      baseCurrency: 'EUR',
      settings: defaultExposureSettings(),
      settingsSource: 'default',
      holdings: [],
      savingsAccounts,
      properties,
      fxRates: ['GBP', 'USD'].map((currency) => ({
        currency,
        rate: RATES.get(currency)!,
        sourceDate: '2026-10-09',
        updatedAt: '2026-10-09T18:00:00.000Z',
        stale: false,
      })),
    }),
  );
}

describe('the Overview against net worth', () => {
  const view = overview();
  const dashboard = dashboardFigures();

  test('savings agree to the cent', () => {
    expect(toCents(view.savingsValue)).toBe(toCents(dashboard.savings));
  });

  test('property equity agrees to the cent, negative equity included', () => {
    expect(view.negative.some((row) => row.kind === 'property')).toBe(true);
    expect(toCents(view.propertyValue)).toBe(toCents(dashboard.propertyEquity));
  });

  test('together they are the total', () => {
    expect(toCents(view.totalValue)).toBe(
      toCents(dashboard.savings) + toCents(dashboard.propertyEquity),
    );
  });
});

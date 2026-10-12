/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import {
  computeCurrentPensionBalance,
  computePensionGrowthData,
  computePensionTotals,
} from './pension-calculations';

const pot = (id: number, balance: number, currency: PensionPot['currency']): PensionPot => ({
  id,
  balance,
  currency,
  name: 'Pension',
  provider: 'Provider',
  type: 'Workplace',
  employeeMonthly: 0,
  employerMonthly: 0,
  investmentStrategy: null,
  metadata: {},
  color: null,
  emoji: null,
  notes: '',
});
const txn = (
  potId: number,
  date: string,
  type: PensionTransaction['type'],
  amount: number,
  taxAmount = 0,
): PensionTransaction => ({
  id: 1,
  potId,
  date,
  type,
  amount,
  taxAmount,
  note: '',
  isEmployer: null,
});

test('reconstructs mixed-currency year ends with net contributions, fees, signed statements and future deltas', () => {
  const year = new Date().getUTCFullYear();
  const transactions = [
    txn(1, `${year}-01-01`, 'contribution', 300, 50),
    txn(1, `${year - 2}-01-01`, 'contribution', 500),
    txn(2, `${year - 1}-06-01`, 'annual_statement', -100),
    txn(1, `${year - 1}-12-31`, 'fee', 20),
    txn(1, `${year - 1}-02-01`, 'annual_statement', 200),
    txn(1, `${year + 1}-01-01`, 'contribution', 100),
    txn(999, `${year - 1}-06-01`, 'contribution', 90000),
    txn(1, 'invalid', 'contribution', 90000),
  ];
  const before = structuredClone(transactions);
  expect(
    computePensionGrowthData(
      [pot(1, 1000, 'EUR'), pot(2, 500, 'GBP'), pot(3, 200, 'EUR')],
      transactions,
      (amount, currency) => amount * (currency === 'GBP' ? 2 : 1),
    ),
  ).toEqual([
    { year: String(year - 2), value: 1870 },
    { year: String(year - 1), value: 1850 },
    { year: String(year), value: 2100 },
  ]);
  expect(transactions).toEqual(before);
});

test('keeps non-negative balances and handles empty or entirely invalid histories', () => {
  const year = new Date().getUTCFullYear();
  const pots = [pot(1, -100, 'EUR')];
  const identity = (amount: number) => amount;
  expect(computePensionGrowthData(pots, [], identity)).toEqual([]);
  expect(
    computePensionGrowthData([], [txn(1, '2020-01-01', 'contribution', 10)], identity),
  ).toEqual([]);
  expect(computePensionGrowthData(pots, [txn(1, 'invalid', 'fee', 10)], identity)).toEqual([]);
  expect(
    computePensionGrowthData(pots, [txn(1, `${year}-01-01`, 'contribution', 100)], identity),
  ).toEqual([{ year: String(year), value: 0 }]);
});

test('ignores transaction types the ledger does not know, like the server', () => {
  const year = new Date().getUTCFullYear();
  const legacy = {
    ...txn(1, `${year}-01-01`, 'fee', 100),
    type: 'transfer',
  } as unknown as PensionTransaction;
  // A transfer never moved the stored balance, so going back in time it changes nothing.
  expect(
    computePensionGrowthData(
      [pot(1, 1000, 'EUR')],
      [legacy, txn(1, `${year - 1}-01-01`, 'fee', 10)],
      (amount) => amount,
    ),
  ).toEqual([
    { year: String(year - 1), value: 1000 },
    { year: String(year), value: 1000 },
  ]);
});

test('counts a negative pot as stored, so the page total matches the dashboard', () => {
  const pots = [pot(1, 30_000.5, 'EUR'), pot(2, -50, 'EUR'), pot(3, 1_000.01, 'GBP')];
  expect(computeCurrentPensionBalance(pots[1]!, [])).toBe(-50);
  // GBP at 1.18: 1,180.0118 rounds to 1,180.01, and the total is a sum of cents.
  expect(
    computePensionTotals(pots, [], (amount, currency) => amount * (currency === 'GBP' ? 1.18 : 1))
      .totalInBase,
  ).toBe(31_130.51);
});

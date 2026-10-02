/// <reference types="bun-types" />
import { expect, test } from 'bun:test';
import type { PensionPot, PensionTransaction } from '@quro/shared';
import { computePensionGrowthData } from './pension-calculations';

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

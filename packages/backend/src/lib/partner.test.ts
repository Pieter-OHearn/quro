import { expect, test } from 'bun:test';
import { householdShare, scopeHouseholdRows } from './partner';
import { getPropertyDebt } from './propertyDebt';

test('household scoping changes only money columns and preserves missing principal', () => {
  const rows = [
    {
      mortgageId: 7,
      type: 'repayment',
      amount: 1200,
      interest: 200,
      principal: null,
      unappliedPrincipal: 0,
      date: '2026-08-01',
    },
  ];
  expect(scopeHouseholdRows('mortgageRepayments', rows, () => true)).toEqual([
    { ...rows[0]!, amount: 600, interest: 100 },
  ]);
  expect(rows[0]?.amount).toBe(1200);
  expect(scopeHouseholdRows('mortgageRepayments', rows, () => true, 'full')).toEqual(rows);
  expect(scopeHouseholdRows('mortgageRepayments', rows, () => false)).toEqual(rows);
  expect(householdShare(undefined)).toBe(1);
});

test('a property owes only its linked mortgage, while that mortgage is in the active set', () => {
  const balances = new Map([
    [1, 100000],
    [2, 0],
  ]);
  expect(getPropertyDebt({ mortgageId: 1 }, balances)).toBe(100000);
  expect(getPropertyDebt({ mortgageId: 2 }, balances)).toBe(0);
  expect(getPropertyDebt({ mortgageId: 3 }, balances)).toBe(0);
  expect(getPropertyDebt({ mortgageId: null }, balances)).toBe(0);
});

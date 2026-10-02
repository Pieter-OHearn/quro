import { expect, test } from 'bun:test';
import { householdShare, scopeHouseholdRows } from './partner';
import { getPropertyDebt } from './propertyDebt';

test('household scoping changes only money columns and preserves missing principal', () => {
  const rows = [
    { propertyId: 7, amount: 1200, interest: 200, principal: null, date: '2026-08-01' },
  ];
  expect(scopeHouseholdRows('propertyTransactions', rows, () => true)).toEqual([
    { ...rows[0], amount: 600, interest: 100 },
  ]);
  expect(rows[0]?.amount).toBe(1200);
  expect(scopeHouseholdRows('propertyTransactions', rows, () => true, 'full')).toEqual(rows);
  expect(scopeHouseholdRows('propertyTransactions', rows, () => false)).toEqual(rows);
  expect(householdShare(undefined)).toBe(1);
});

test('linked property debt ignores stale manual copies and respects the active mortgage set', () => {
  const balances = new Map([
    [1, 100000],
    [2, 0],
  ]);
  expect(getPropertyDebt({ mortgageId: 1, mortgage: 999999 }, balances)).toBe(100000);
  expect(getPropertyDebt({ mortgageId: 2, mortgage: 999999 }, balances)).toBe(0);
  expect(getPropertyDebt({ mortgageId: 3, mortgage: 999999 }, balances)).toBe(0);
  expect(getPropertyDebt({ mortgageId: null, mortgage: '12000' }, balances)).toBe(12000);
});

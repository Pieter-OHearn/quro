import { describe, expect, mock, test } from 'bun:test';
import { savingsAccounts } from '../db/schema';
import {
  toFiniteNumber,
  toSignedSavingsAmount,
  updateSavingsAccountBalanceByDelta,
} from './savingsBalance';

type SavingsBalanceClient = Parameters<typeof updateSavingsAccountBalanceByDelta>[0];

describe('savings balance helpers', () => {
  test('coerces finite values and defaults invalid values to zero', () => {
    expect(toFiniteNumber('12.50')).toBe(12.5);
    expect(toFiniteNumber(7)).toBe(7);
    expect(toFiniteNumber(undefined)).toBe(0);
    expect(toFiniteNumber(null)).toBe(0);
    expect(toFiniteNumber('not-a-number')).toBe(0);
  });

  test('normalizes transaction signs independently of the input amount sign', () => {
    expect(toSignedSavingsAmount('withdrawal', 25)).toBe(-25);
    expect(toSignedSavingsAmount('withdrawal', -25)).toBe(-25);
    expect(toSignedSavingsAmount('deposit', -25)).toBe(25);
    expect(toSignedSavingsAmount('interest', -5)).toBe(5);
  });

  test('skips database updates for a zero delta', async () => {
    const update = mock(() => ({ set: mock(() => ({ where: mock(() => Promise.resolve()) })) }));
    const client = { update } as unknown as SavingsBalanceClient;

    await updateSavingsAccountBalanceByDelta(client, 42, 0);

    expect(update).not.toHaveBeenCalled();
  });

  test('executes the complete update chain for a non-zero delta', async () => {
    const where = mock(() => Promise.resolve());
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const client = { update } as unknown as SavingsBalanceClient;

    await updateSavingsAccountBalanceByDelta(client, 42, -25);

    expect(update).toHaveBeenCalledWith(savingsAccounts);
    expect(set).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});

/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { normalizeSavingsAccount, normalizeSavingsTransaction } from './normalizers';

test('normalizes numeric-string savings account fields from the API', () => {
  const account = normalizeSavingsAccount({
    id: 1,
    name: 'HECS',
    bank: 'Up Bank',
    balance: '20307.00' as unknown as number,
    currency: 'AUD',
    interestRate: '4.85' as unknown as number,
    accountType: 'Easy Access',
    color: '#4338ca',
    emoji: '🧑‍🎓',
  });

  expect(account.balance).toBe(20307);
  expect(account.interestRate).toBe(4.85);
});

test('normalizes numeric-string savings transaction amounts from the API', () => {
  const transaction = normalizeSavingsTransaction({
    id: 7,
    accountId: 1,
    type: 'interest',
    amount: '123,15' as unknown as number,
    date: '2026-03-01',
    note: null as unknown as string,
  });

  expect(transaction.amount).toBe(123.15);
  expect(transaction.note).toBe('');
});

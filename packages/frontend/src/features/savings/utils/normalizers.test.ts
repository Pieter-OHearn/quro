/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { normalizeSavingsAccount, normalizeSavingsTransaction } from './normalizers';

test('passes through numeric savings account fields from the API', () => {
  const account = normalizeSavingsAccount({
    id: 1,
    name: 'HECS',
    bank: 'Up Bank',
    balance: 20307,
    currency: 'AUD',
    interestRate: 4.85,
    accountType: 'Easy Access',
    color: '#4338ca',
    emoji: '🧑‍🎓',
  });

  expect(account.balance).toBe(20307);
  expect(account.interestRate).toBe(4.85);
});

test('defaults a missing savings transaction note to an empty string', () => {
  const transaction = normalizeSavingsTransaction({
    id: 7,
    accountId: 1,
    type: 'interest',
    amount: 123.15,
    date: '2026-03-01',
    note: null as unknown as string,
  });

  expect(transaction.amount).toBe(123.15);
  expect(transaction.note).toBe('');
});

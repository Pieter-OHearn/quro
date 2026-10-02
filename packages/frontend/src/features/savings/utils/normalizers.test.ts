/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { normalizeSavingsTransaction } from './normalizers';

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

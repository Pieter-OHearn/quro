/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { saveSavingsTransaction } from '../utils/save-transaction';
import type { SaveTransactionInput } from '../types';

const transaction: SaveTransactionInput = {
  accountId: 1,
  type: 'deposit',
  amount: 25,
  date: '2026-06-20',
  note: 'Test deposit',
};

test('saveSavingsTransaction closes only after a successful save', async () => {
  let closed = false;
  let error = '';

  await saveSavingsTransaction({
    transaction,
    onSave: async () => {},
    onClose: () => {
      closed = true;
    },
    setError: (message) => {
      error = message;
    },
  });

  expect(closed).toBe(true);
  expect(error).toBe('');
});

test('saveSavingsTransaction keeps the modal open and reports errors when save fails', async () => {
  let closed = false;
  let error = '';

  await saveSavingsTransaction({
    transaction,
    onSave: async () => {
      throw new Error('API failed');
    },
    onClose: () => {
      closed = true;
    },
    setError: (message) => {
      error = message;
    },
  });

  expect(closed).toBe(false);
  expect(error).toBe('Failed to save transaction. Please try again.');
});

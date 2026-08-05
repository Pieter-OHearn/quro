/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { MORTGAGE_RATE_TYPES, MORTGAGE_REPAYMENT_TYPES } from '@quro/shared';
import { RATE_TYPES, REPAYMENT_TYPES } from './AddMortgageModal';

test('mortgage rate type options come from the shared backend contract', () => {
  expect(RATE_TYPES).toEqual([...MORTGAGE_RATE_TYPES]);
  expect(RATE_TYPES).not.toContain('Tracker');
  expect(RATE_TYPES).not.toContain('Offset');
});

test('mortgage repayment method options come from the shared backend contract', () => {
  expect(REPAYMENT_TYPES).toEqual([...MORTGAGE_REPAYMENT_TYPES]);
  expect(REPAYMENT_TYPES).toEqual(['Annuity', 'Linear']);
});

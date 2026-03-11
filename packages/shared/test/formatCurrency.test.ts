/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { formatCurrency } from '../src/utils/index';

test('formats currency values with cents by default', () => {
  expect(formatCurrency(1234, 'EUR')).toBe('€1,234.00');
});

test('still supports opting out of cents explicitly', () => {
  expect(formatCurrency(1234, 'EUR', false)).toBe('€1,234');
});

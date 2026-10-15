import { expect, test } from 'bun:test';
import { formatAsNegative } from './liability';

const fmt = (value: number) => `€${value.toFixed(2)}`;

test('a positive balance or outflow reads as negative with a true minus sign', () => {
  expect(formatAsNegative(fmt, 277062.36)).toBe('−€277062.36');
});

test('zero reads without a sign and a credit reads as a plain amount', () => {
  expect(formatAsNegative(fmt, 0)).toBe('€0.00');
  expect(formatAsNegative(fmt, -12.5)).toBe('€12.50');
});

import { describe, expect, test } from 'bun:test';
import { parseDriverNumeric } from './driverNumeric';

describe('parseDriverNumeric', () => {
  test('parses finite numeric strings', () => {
    expect(parseDriverNumeric('12.50')).toBe(12.5);
    expect(parseDriverNumeric('0')).toBe(0);
  });

  test.each(['NaN', 'Infinity', '-Infinity', 'garbage'])(
    'throws on non-finite driver value %s instead of masking it as 0',
    (value) => {
      expect(() => parseDriverNumeric(value)).toThrow('Non-finite numeric value');
    },
  );
});

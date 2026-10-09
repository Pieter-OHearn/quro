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

describe('driver numerics round-trip at their column scale', () => {
  // The envelope documented in docs/financial-invariants.md: within it, the number the API
  // serialises prints back as exactly the decimal PostgreSQL stored.
  const cases = [
    { scale: 2, below: 1e13, label: 'money numeric(19,2)' },
    { scale: 4, below: 1e3, label: 'rates numeric(7,4)' },
    { scale: 6, below: 1e9, label: 'shares numeric(19,6) and FX numeric(12,6)' },
  ];
  let state = 7;
  const random = () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };

  test.each(cases)('$label', ({ scale, below }) => {
    for (let index = 0; index < 20_000; index += 1) {
      const integer = Math.floor(random() * below);
      const fraction = String(Math.floor(random() * 10 ** scale)).padStart(scale, '0');
      const stored = `${random() < 0.5 ? '-' : ''}${integer}.${fraction}`;
      const expected = /^-0\.0+$/.test(stored) ? stored.slice(1) : stored;
      expect(parseDriverNumeric(stored).toFixed(scale)).toBe(expected);
    }
  });
});

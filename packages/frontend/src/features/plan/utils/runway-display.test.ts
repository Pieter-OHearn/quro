import { describe, expect, test } from 'bun:test';
import { formatMonths, RUNWAY_BAND_META } from './runway-display';

describe('runway display helpers', () => {
  test('formats finite and indefinite coverage without probability language', () => {
    expect(formatMonths(6.25)).toBe('6.3 months');
    expect(formatMonths(null)).toBe('Covered indefinitely');
    expect(Object.values(RUNWAY_BAND_META).map((band) => band.label)).toEqual([
      'Critical',
      'Building',
      'Resilient',
    ]);
  });
});

import { describe, expect, test } from 'bun:test';
import { schedulersDisabled } from './schedulerSwitch';

describe('schedulersDisabled', () => {
  test('keeps schedulers on when the switch is unset or false', () => {
    expect(schedulersDisabled({})).toBe(false);
    for (const value of ['', ' ', '0', 'false', 'FALSE', 'no']) {
      expect(schedulersDisabled({ QRO_DISABLE_SCHEDULERS: value })).toBe(false);
    }
  });

  test('turns schedulers off for true values', () => {
    for (const value of ['1', 'true', 'True', ' yes ']) {
      expect(schedulersDisabled({ QRO_DISABLE_SCHEDULERS: value })).toBe(true);
    }
  });

  test('rejects anything else instead of guessing', () => {
    expect(() => schedulersDisabled({ QRO_DISABLE_SCHEDULERS: 'off' })).toThrow(
      'QRO_DISABLE_SCHEDULERS must be true, false, 1, 0, yes or no',
    );
  });
});

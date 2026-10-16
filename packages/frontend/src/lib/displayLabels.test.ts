import { describe, expect, test } from 'bun:test';
import { PENSION_TYPES } from '@/features/pension/constants';
import { SAVINGS_ACCOUNT_TYPES } from '@quro/shared';
import { displayLabel, displayLabelOptions } from './displayLabels';

describe('displayLabel', () => {
  test('shows stored Title Case values in sentence case', () => {
    expect(displayLabel('Easy Access')).toBe('Easy access');
    expect(displayLabel('Buy-to-Let')).toBe('Buy-to-let');
    expect(displayLabel('Property Equity')).toBe('Property equity');
  });

  test('covers every savings account and pension type the app stores', () => {
    for (const type of [...SAVINGS_ACCOUNT_TYPES, ...PENSION_TYPES]) {
      expect(displayLabel(type)).not.toMatch(/ [A-Z]/);
    }
  });

  test('leaves values it does not know as written', () => {
    expect(displayLabel('Holiday Home in Spain')).toBe('Holiday Home in Spain');
    expect(displayLabel('Commercial')).toBe('Commercial');
  });

  test('keeps the stored value as the option value', () => {
    expect(displayLabelOptions(['Term Deposit'])).toEqual([
      { value: 'Term Deposit', label: 'Term deposit' },
    ]);
  });
});

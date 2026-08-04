import { describe, expect, test } from 'bun:test';
import {
  applyPrincipalToBalance,
  restorePrincipalToBalance,
  roundCurrency,
  validatePrincipalAgainstBalance,
} from './balance';

describe('balance reconciliation helpers', () => {
  test('rounds currency values and floating-point artifacts to two decimals', () => {
    expect(roundCurrency(12.345)).toBe(12.35);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  test('applies principal and clamps the resulting balance at zero', () => {
    expect(applyPrincipalToBalance(100, 25.55)).toBe(74.45);
    expect(applyPrincipalToBalance(100, 100)).toBe(0);
    expect(applyPrincipalToBalance(100, 125)).toBe(0);
  });

  test('restores principal without applying an upper bound', () => {
    expect(restorePrincipalToBalance(100, 25.555)).toBe(125.56);
  });

  test('allows the one-cent tolerance and rejects amounts beyond it', () => {
    expect(validatePrincipalAgainstBalance(100, 100)).toBeNull();
    expect(validatePrincipalAgainstBalance(100.01, 100)).toBeNull();
    expect(validatePrincipalAgainstBalance(100.02, 100)).toBe(
      'Principal portion cannot exceed the current outstanding balance',
    );
  });
});

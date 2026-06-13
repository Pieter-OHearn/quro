// Shared balance-reconciliation helpers used by mortgage and property
// repayment transactions. Mirrors the debt-payment pattern: a repayment's
// principal portion reduces an outstanding balance when recorded and is
// restored if the transaction is later removed or edited.

export function roundCurrency(value: number): number {
  return Number.parseFloat(value.toFixed(2));
}

// Reduce an outstanding balance by a repayment's principal, clamped at zero.
export function applyPrincipalToBalance(currentBalance: number, principal: number): number {
  return Math.max(0, roundCurrency(currentBalance - principal));
}

// Restore principal to an outstanding balance (the inverse of applying it).
export function restorePrincipalToBalance(currentBalance: number, principal: number): number {
  return roundCurrency(currentBalance + principal);
}

export function validatePrincipalAgainstBalance(
  principal: number,
  currentBalance: number,
): string | null {
  if (principal > roundCurrency(currentBalance) + 0.01) {
    return 'Principal portion cannot exceed the current outstanding balance';
  }
  return null;
}

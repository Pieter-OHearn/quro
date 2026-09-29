/**
 * Pure validation rules shared by the API and the web forms. Each function returns
 * an error message, or null when the input is valid.
 */

export const MAX_RATE_CHANGE_PERCENT = 25;
const SPLIT_TOLERANCE = 0.01;

export const VALIDATION_MESSAGES = {
  interestExceedsAmount: 'Interest cannot exceed the total payment',
  principalExceedsAmount: 'Principal cannot exceed the total payment',
  splitMismatch: 'Interest and principal must add up to the total payment',
  taxExceedsContribution: 'Tax amount cannot exceed contribution amount',
  rateChangeTooHigh: `Rate-change amount cannot exceed ${MAX_RATE_CHANGE_PERCENT}`,
  rateChangeNeedsFixedYears: 'Rate-change transactions require fixed years',
} as const;

export function validateBalanceWithinOriginal(
  originalAmount: number,
  balance: number,
  label = 'Remaining balance',
): string | null {
  return balance > originalAmount ? `${label} cannot exceed the original amount` : null;
}

export function validateInterestWithinAmount(amount: number, interest: number): string | null {
  return interest > amount ? VALIDATION_MESSAGES.interestExceedsAmount : null;
}

/** Validates an interest/principal split of a repayment. Principal is optional. */
export function validateRepaymentSplit(params: {
  amount: number;
  interest: number;
  principal?: number | null;
}): string | null {
  const { amount, interest, principal } = params;
  const interestError = validateInterestWithinAmount(amount, interest);
  if (interestError) return interestError;
  if (principal === null || principal === undefined) return null;
  if (principal > amount) return VALIDATION_MESSAGES.principalExceedsAmount;
  if (Math.abs(interest + principal - amount) > SPLIT_TOLERANCE) {
    return VALIDATION_MESSAGES.splitMismatch;
  }
  return null;
}

export function validateTaxWithinContribution(amount: number, taxAmount: number): string | null {
  return taxAmount > amount ? VALIDATION_MESSAGES.taxExceedsContribution : null;
}

export function validateRateChange(
  ratePercent: number,
  fixedYears: number | null | undefined,
): string | null {
  if (ratePercent > MAX_RATE_CHANGE_PERCENT) return VALIDATION_MESSAGES.rateChangeTooHigh;
  if (fixedYears === null || fixedYears === undefined || fixedYears <= 0) {
    return VALIDATION_MESSAGES.rateChangeNeedsFixedYears;
  }
  return null;
}

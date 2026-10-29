import { householdAmount, type HouseholdWeight } from './household.js';

// Property types whose ledger may carry rent income and expenses. Property types are free text,
// so they are compared trimmed and case-insensitively.
const INVESTMENT_PROPERTY_TYPE_KEYS = new Set([
  'buy-to-let',
  'investment',
  'holiday home',
  'commercial',
  'rental',
]);

/** Whether a property type is an investment property (rent income and expenses allowed). */
export function isInvestmentPropertyType(propertyType: string | null | undefined): boolean {
  return (
    typeof propertyType === 'string' &&
    INVESTMENT_PROPERTY_TYPE_KEYS.has(propertyType.trim().toLowerCase())
  );
}

/** The debt a property carries: its linked mortgage while that mortgage is active, otherwise none. */
export type PropertyDebtSource = { outstandingBalance: number; isJoint: boolean };

/**
 * A property's equity: its value less its linked active mortgage's outstanding balance, negative
 * equity kept. Each side is weighted by its own row's household share, as net worth weights them,
 * so the result is what the property adds to the person's net worth. It keeps sub-cent precision
 * and is rounded once, where it is shown or summed.
 */
export function propertyEquity(
  property: { currentValue: number; isJoint: boolean },
  debt: PropertyDebtSource | null,
  weight: HouseholdWeight = 'personal',
): number {
  const value = householdAmount(property.currentValue, property.isJoint, weight);
  return debt === null
    ? value
    : value - householdAmount(debt.outstandingBalance, debt.isJoint, weight);
}

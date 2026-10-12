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

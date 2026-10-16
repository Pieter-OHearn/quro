import type { SelectInputOption } from '@/components/ui';

/**
 * Display labels for stored values that were saved in Title Case. The stored value is what the
 * API, the database and the exports carry, so it never changes; the label is only what a screen
 * shows, in the sentence case the rest of the app uses. A value that is not listed (a property
 * type someone typed, a bank's own account name) is shown as it was written.
 */
const DISPLAY_LABELS: Readonly<Record<string, string>> = {
  // Savings account types
  'Easy Access': 'Easy access',
  'Term Deposit': 'Term deposit',
  // Pension types
  'Workplace Pension': 'Workplace pension',
  'Personal Pension': 'Personal pension',
  'State Pension': 'State pension',
  // Property types
  'Buy-to-Let': 'Buy-to-let',
  'Primary Residence': 'Primary residence',
  'Holiday Home': 'Holiday home',
  // The runway's rule set when no country applies
  GENERIC: 'Generic',
  // Asset allocation names from the API
  'Property Equity': 'Property equity',
};

export function displayLabel(value: string): string {
  return DISPLAY_LABELS[value] ?? value;
}

/** Options for a select whose stored values are shown through `displayLabel`. */
export function displayLabelOptions(values: readonly string[]): SelectInputOption[] {
  return values.map((value) => ({ value, label: displayLabel(value) }));
}

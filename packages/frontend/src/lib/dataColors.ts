/** Stable categorical values stored on goals/accounts/categories. UI chrome uses theme.css.
 * Keep these values stable: existing records and color swatch selection use their hex identity.
 */
export const DATA_COLORS = {
  primary: '#6366f1',
  cash: '#0ea5e9',
  income: '#10b981',
  forecast: '#f59e0b',
  property: '#f97316',
  milestone: '#ec4899',
  recurring: '#14b8a6',
  portfolio: '#8b5cf6',
  liquidity: '#06b6d4',
  'portfolio-muted': '#a78bfa',
  'expense-muted': '#fb7185',
  neutral: '#94a3b8',
  growth: '#22c55e',
  link: '#3b82f6',
  alert: '#ef4444',
  premium: '#a855f7',
  sun: '#eab308',
  expense: '#f43f5e',
} as const;

const COLOR_TOKENS = new Map<string, string>(
  Object.entries(DATA_COLORS).map(([name, value]) => [value, `var(--data-${name})`]),
);

/** Use semantic CSS tokens for presets, while preserving custom colors from saved records. */
export function dataColorToken(color: string): string {
  return COLOR_TOKENS.get(color) ?? color;
}

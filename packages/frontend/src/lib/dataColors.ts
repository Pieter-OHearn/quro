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

type DataColorName = keyof typeof DATA_COLORS;

/**
 * The six category colours a colour picker offers (goals, budget categories, debts), one per
 * chart colour `--viz-1` to `--viz-6`. Each swatch saves one canonical `DATA_COLORS` identity.
 * Gain green and loss red are semantic and never category colours.
 */
export const CATEGORY_COLORS = [
  DATA_COLORS.income,
  DATA_COLORS.primary,
  DATA_COLORS.forecast,
  DATA_COLORS.property,
  DATA_COLORS.milestone,
  DATA_COLORS.neutral,
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** Accessible names for the offered swatches, in the order of `CATEGORY_COLORS`. */
export const CATEGORY_COLOR_NAMES: Record<CategoryColor, string> = {
  [DATA_COLORS.income]: 'Green',
  [DATA_COLORS.primary]: 'Blue',
  [DATA_COLORS.forecast]: 'Amber',
  [DATA_COLORS.property]: 'Terracotta',
  [DATA_COLORS.milestone]: 'Plum',
  [DATA_COLORS.neutral]: 'Grey',
};

// The offered swatch each saved identity shows as selected: the swatch with the same display
// colour, and the warm terracotta swatch for the identities that display in the loss colour.
const CATEGORY_COLOR_BY_NAME: Record<DataColorName, CategoryColor> = {
  primary: DATA_COLORS.primary,
  cash: DATA_COLORS.income,
  income: DATA_COLORS.income,
  forecast: DATA_COLORS.forecast,
  property: DATA_COLORS.property,
  milestone: DATA_COLORS.milestone,
  recurring: DATA_COLORS.income,
  portfolio: DATA_COLORS.primary,
  liquidity: DATA_COLORS.income,
  'portfolio-muted': DATA_COLORS.milestone,
  'expense-muted': DATA_COLORS.property,
  neutral: DATA_COLORS.neutral,
  growth: DATA_COLORS.income,
  link: DATA_COLORS.primary,
  alert: DATA_COLORS.property,
  premium: DATA_COLORS.primary,
  sun: DATA_COLORS.forecast,
  expense: DATA_COLORS.property,
};

const CATEGORY_COLOR_BY_VALUE = new Map<string, CategoryColor>(
  (Object.entries(DATA_COLORS) as [DataColorName, string][]).map(([name, value]) => [
    value,
    CATEGORY_COLOR_BY_NAME[name],
  ]),
);

/**
 * The offered swatch a saved colour selects in a picker. Saved values are never rewritten: a
 * legacy identity keeps its value and displays through `dataColorToken()`. A custom colour that
 * is not a `DATA_COLORS` identity selects no swatch.
 */
export function categoryColorFor(color: string): CategoryColor | undefined {
  return CATEGORY_COLOR_BY_VALUE.get(color.toLowerCase());
}

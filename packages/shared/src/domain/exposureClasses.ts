/**
 * The asset classes an investment holding can be filed under, how they group for the reference
 * mixes, and a suggestion from what the holding already says about itself. A suggestion is only
 * ever a default for the person to look at: nothing here saves a class.
 */

export const ASSET_CLASSES = [
  'equity_developed',
  'equity_emerging',
  'bond_short_government',
  'bond_long_government',
  'bond_investment_grade',
  'bond_high_yield',
  'cash_money_market',
  'gold_commodities',
  'property_reits',
  'crypto',
  'other',
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

/** The bucket for holdings whose class is not set. It is not an asset class a person can pick. */
export const UNCLASSIFIED = 'unclassified' as const;
export type AssetClassKey = AssetClass | typeof UNCLASSIFIED;

export const ASSET_CLASS_LABELS: Record<AssetClassKey, string> = {
  equity_developed: 'Equity, developed markets',
  equity_emerging: 'Equity, emerging markets',
  bond_short_government: 'Bonds, short government',
  bond_long_government: 'Bonds, long government',
  bond_investment_grade: 'Bonds, investment grade',
  bond_high_yield: 'Bonds, high yield',
  cash_money_market: 'Cash and money market',
  gold_commodities: 'Gold and commodities',
  property_reits: 'Property and REITs',
  crypto: 'Crypto',
  other: 'Other',
  unclassified: 'Unclassified',
};

/** The four groups the reference mixes are written in. */
export const MIX_GROUPS = ['stocks', 'bonds', 'cash', 'other'] as const;
export type MixGroup = (typeof MIX_GROUPS)[number];

export const MIX_GROUP_LABELS: Record<MixGroup, string> = {
  stocks: 'Stocks',
  bonds: 'Bonds',
  cash: 'Cash',
  other: 'Other assets',
};

/**
 * Property funds, gold and crypto sit in "other" with the classes that have no group of their own:
 * the published mixes only name stocks, bonds and cash.
 */
export const ASSET_CLASS_GROUP: Record<AssetClass, MixGroup> = {
  equity_developed: 'stocks',
  equity_emerging: 'stocks',
  bond_short_government: 'bonds',
  bond_long_government: 'bonds',
  bond_investment_grade: 'bonds',
  bond_high_yield: 'bonds',
  cash_money_market: 'cash',
  gold_commodities: 'other',
  property_reits: 'other',
  crypto: 'other',
  other: 'other',
};

const ASSET_CLASS_SET = new Set<string>(ASSET_CLASSES);

export function isAssetClass(value: unknown): value is AssetClass {
  return typeof value === 'string' && ASSET_CLASS_SET.has(value);
}

export function assetClassLabel(key: AssetClassKey): string {
  return ASSET_CLASS_LABELS[key];
}

export type AssetClassSuggestion = { assetClass: AssetClass; reason: string };

type SuggestionInput = {
  itemType?: string | null;
  sector?: string | null;
  name?: string | null;
};

type Rule = { test: RegExp; assetClass: AssetClass; reason: string };

// The first rule that matches wins, so the more specific rules come first. Each looks at the name
// and the sector, never the ticker, which carries no meaning of its own.
const KEYWORD_RULES: readonly Rule[] = [
  {
    test: /money market|liquidity|\bcash\b|overnight/,
    assetClass: 'cash_money_market',
    reason: 'The name mentions cash or a money market.',
  },
  {
    test: /\b(gold|silver|bullion|precious|commodit\w*)\b/,
    assetClass: 'gold_commodities',
    reason: 'The name mentions gold or commodities.',
  },
  {
    test: /bitcoin|ethereum|crypto|\bbtc\b|\beth\b/,
    assetClass: 'crypto',
    reason: 'The name mentions crypto.',
  },
  {
    test: /\breits?\b|real estate|\bproperty\b/,
    assetClass: 'property_reits',
    reason: 'The name mentions property or REITs.',
  },
  {
    test: /high.?yield|junk/,
    assetClass: 'bond_high_yield',
    reason: 'The name mentions high yield bonds.',
  },
  {
    test: /corporate|investment.?grade|\bcredit\b/,
    assetClass: 'bond_investment_grade',
    reason: 'The name mentions corporate or investment grade bonds.',
  },
  {
    test: /(government|treasur|gilt|sovereign|\bgovt\b).*(short|1-3|0-3|ultra)|(short|1-3|0-3|ultra).*(government|treasur|gilt|sovereign|\bgovt\b)/,
    assetClass: 'bond_short_government',
    reason: 'The name mentions short-dated government bonds.',
  },
  {
    test: /government|treasur|gilt|sovereign|\bgovt\b/,
    assetClass: 'bond_long_government',
    reason: 'The name mentions government bonds; check the maturity.',
  },
  {
    test: /\bbonds?\b|fixed income|aggregate/,
    assetClass: 'bond_investment_grade',
    reason: 'The name mentions bonds; check what kind.',
  },
  {
    test: /emerging|\bem\b/,
    assetClass: 'equity_emerging',
    reason: 'The name mentions emerging markets.',
  },
  {
    test: /equity|equities|stock|\bshares?\b|\bindex\b|\bmsci\b|s&p|nasdaq|\bworld\b|all.?world/,
    assetClass: 'equity_developed',
    reason: 'The name describes an equity holding.',
  },
];

const SHARE_ITEM_TYPES = new Set(['equity', 'adr', 'preference', 'trust']);
const DERIVATIVE_ITEM_TYPES = new Set(['warrant', 'right']);

/**
 * A suggested class from the item type, the sector and the name, or null when they say nothing
 * useful. It is a default to show next to the field, not a decision: the person confirms it.
 */
export function suggestAssetClass(input: SuggestionInput): AssetClassSuggestion | null {
  const text = `${input.name ?? ''} ${input.sector ?? ''}`.toLowerCase();
  const matched = KEYWORD_RULES.find((rule) => rule.test.test(text));
  if (matched) return { assetClass: matched.assetClass, reason: matched.reason };
  const itemType = input.itemType?.trim().toLowerCase() ?? '';
  if (DERIVATIVE_ITEM_TYPES.has(itemType)) {
    return { assetClass: 'other', reason: 'Warrants and rights are not stocks or bonds.' };
  }
  if (SHARE_ITEM_TYPES.has(itemType)) {
    return {
      assetClass: 'equity_developed',
      reason: 'Individual shares are usually developed-market equity; check the market.',
    };
  }
  return null;
}

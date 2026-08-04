import {
  parseTickerItemType,
  type Holding,
  type HoldingPriceHistoryEntry,
  type HoldingTransaction,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';

function toNullableId(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function normalizeHolding(raw: Holding): Holding {
  return {
    ...raw,
    itemType: parseTickerItemType(raw.itemType),
    exchangeMic: raw.exchangeMic ?? null,
    industry: raw.industry ?? null,
    priceUpdatedAt: raw.priceUpdatedAt ?? null,
  };
}

export function normalizeHoldingTransaction(raw: HoldingTransaction): HoldingTransaction {
  return raw;
}

export function normalizeHoldingPriceHistoryEntry(
  raw: HoldingPriceHistoryEntry,
): HoldingPriceHistoryEntry {
  return raw;
}

export function normalizeProperty(raw: Property): Property {
  return {
    ...raw,
    mortgageId: toNullableId(raw.mortgageId),
    emoji: raw.emoji?.trim() || '🏠',
  };
}

export function normalizePropertyTransaction(raw: PropertyTransaction): PropertyTransaction {
  return raw;
}

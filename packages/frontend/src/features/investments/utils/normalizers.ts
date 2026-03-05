import {
  parseTickerItemType,
  type Holding,
  type HoldingPriceHistoryEntry,
  type HoldingTransaction,
  type Property,
  type PropertyTransaction,
} from '@quro/shared';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    const compact = trimmed.replace(/\s+/g, '');
    const hasComma = compact.includes(',');
    const hasDot = compact.includes('.');
    let normalized = compact;

    if (hasComma && hasDot) {
      normalized =
        compact.lastIndexOf(',') > compact.lastIndexOf('.')
          ? compact.replaceAll('.', '').replace(',', '.')
          : compact.replaceAll(',', '');
    } else if (hasComma) {
      normalized = compact.replace(',', '.');
    }

    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

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
    currentPrice: toNumber(raw.currentPrice),
    itemType: parseTickerItemType(raw.itemType),
    exchangeMic: raw.exchangeMic ?? null,
    industry: raw.industry ?? null,
    priceUpdatedAt: raw.priceUpdatedAt ?? null,
  };
}

export function normalizeHoldingTransaction(raw: HoldingTransaction): HoldingTransaction {
  return {
    ...raw,
    shares: raw.shares == null ? null : toNumber(raw.shares),
    price: toNumber(raw.price),
  };
}

export function normalizeHoldingPriceHistoryEntry(
  raw: HoldingPriceHistoryEntry,
): HoldingPriceHistoryEntry {
  return {
    ...raw,
    closePrice: toNumber(raw.closePrice),
  };
}

export function normalizeProperty(raw: Property): Property {
  return {
    ...raw,
    purchasePrice: toNumber(raw.purchasePrice),
    currentValue: toNumber(raw.currentValue),
    mortgage: toNumber(raw.mortgage),
    mortgageId: toNullableId(raw.mortgageId),
    monthlyRent: toNumber(raw.monthlyRent),
  };
}

export function normalizePropertyTransaction(raw: PropertyTransaction): PropertyTransaction {
  return {
    ...raw,
    amount: toNumber(raw.amount),
    interest: raw.interest == null ? null : toNumber(raw.interest),
    principal: raw.principal == null ? null : toNumber(raw.principal),
  };
}

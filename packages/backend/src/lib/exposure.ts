import {
  CURRENCY_RATE_STALE_AFTER_HOURS,
  EXPOSURE_DEFAULTS_VERSION,
  buildExposureView,
  computeExposureFacts,
  defaultExposureSettings,
  isHoldingPriceStale,
  parseExposureSettings,
  toIsoDate,
  type ExposureFxInput,
  type ExposureHoldingInput,
  type ExposureInput,
  type ExposureReport,
  type ExposureSettings,
  type ExposureSettingsState,
} from '@quro/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { exposureSettings, holdingTransactions, holdings } from '../db/schema';
import { FX_BASE_CURRENCY } from './currencyRateCache';
import { getStoredCurrentCurrencyRateRows } from './currencyRateSync';
import { computeSharesByHolding } from './netWorth';
import { toNumberOrZero } from './numbers';

const MS_PER_HOUR = 60 * 60 * 1000;

async function loadExposureSettings(userId: number): Promise<ExposureSettingsState> {
  const [row] = await db.select().from(exposureSettings).where(eq(exposureSettings.userId, userId));
  const base = { defaultsVersion: EXPOSURE_DEFAULTS_VERSION };
  if (!row) {
    return {
      ...base,
      settings: defaultExposureSettings(),
      source: 'default',
      updatedAt: null,
      storedInvalid: false,
    };
  }
  const parsed = parseExposureSettings(row.settings);
  if (!parsed.ok) {
    return {
      ...base,
      settings: defaultExposureSettings(),
      source: 'default',
      updatedAt: row.updatedAt.toISOString(),
      storedInvalid: true,
    };
  }
  return {
    ...base,
    settings: parsed.value,
    source: 'custom',
    updatedAt: row.updatedAt.toISOString(),
    storedInvalid: false,
  };
}

export async function saveExposureSettings(
  userId: number,
  settings: ExposureSettings,
): Promise<ExposureSettingsState> {
  const updatedAt = new Date();
  await db
    .insert(exposureSettings)
    .values({ userId, settings, updatedAt })
    .onConflictDoUpdate({ target: exposureSettings.userId, set: { settings, updatedAt } });
  return loadExposureSettings(userId);
}

/** Removing the row restores the defaults, including any newer default values a release ships. */
export async function resetExposureSettings(userId: number): Promise<ExposureSettingsState> {
  await db.delete(exposureSettings).where(eq(exposureSettings.userId, userId));
  return loadExposureSettings(userId);
}

function toFxInputs(
  rows: Awaited<ReturnType<typeof getStoredCurrentCurrencyRateRows>>,
  now: Date,
): ExposureFxInput[] {
  return rows
    .filter((row) => row.toCurrency === FX_BASE_CURRENCY && row.fromCurrency !== FX_BASE_CURRENCY)
    .flatMap((row) => {
      const rate = toNumberOrZero(row.rate);
      if (!(rate > 0)) return [];
      return [
        {
          currency: row.fromCurrency,
          rate,
          sourceDate: row.sourceDate ?? null,
          updatedAt: row.updatedAt.toISOString(),
          stale:
            now.getTime() - row.updatedAt.getTime() > CURRENCY_RATE_STALE_AFTER_HOURS * MS_PER_HOUR,
        },
      ];
    });
}

/**
 * The caller's own open holdings with the price in use, the shares held and the stored exchange
 * rates. Brokerage holdings are never joint, so a partner's holdings are never part of it.
 */
async function loadExposureInput(
  userId: number,
  settingsState: ExposureSettingsState,
  now: Date = new Date(),
): Promise<ExposureInput> {
  const [holdingRows, transactions, rateRows] = await Promise.all([
    db
      .select()
      .from(holdings)
      .where(and(eq(holdings.userId, userId), isNull(holdings.archivedAt))),
    db
      .select({
        holdingId: holdingTransactions.holdingId,
        type: holdingTransactions.type,
        shares: holdingTransactions.shares,
      })
      .from(holdingTransactions)
      .where(eq(holdingTransactions.userId, userId)),
    getStoredCurrentCurrencyRateRows(),
  ]);
  const shares = computeSharesByHolding(transactions);
  const inputs: ExposureHoldingInput[] = holdingRows.map((row) => ({
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    currency: row.currency,
    sector: row.sector,
    itemType: row.itemType,
    assetClass: row.assetClass,
    riskClassOverride: row.riskClassOverride,
    shares: shares.get(row.id) ?? 0,
    unitPrice: row.manualPrice ?? row.currentPrice,
    priceSource: row.manualPrice == null ? 'synced' : 'manual',
    priceUpdatedAt: row.priceUpdatedAt ? row.priceUpdatedAt.toISOString() : null,
    priceStale: isHoldingPriceStale(
      { ...row, priceUpdatedAt: row.priceUpdatedAt?.toISOString() ?? null },
      now,
    ),
  }));
  return {
    asOf: toIsoDate(now),
    baseCurrency: FX_BASE_CURRENCY,
    settings: settingsState.settings,
    settingsSource: settingsState.source,
    holdings: inputs,
    fxRates: toFxInputs(rateRows, now),
  };
}

export async function buildExposureReport(
  userId: number,
  now = new Date(),
): Promise<ExposureReport> {
  const settings = await loadExposureSettings(userId);
  const input = await loadExposureInput(userId, settings, now);
  const facts = computeExposureFacts(input);
  return { facts, view: buildExposureView(facts), settings };
}

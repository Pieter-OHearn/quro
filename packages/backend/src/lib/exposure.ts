import {
  CURRENCY_RATE_STALE_AFTER_HOURS,
  EXPOSURE_DEFAULTS_VERSION,
  buildExposureHouseholdView,
  buildExposureView,
  computeExposureFacts,
  defaultExposureSettings,
  holdingValuePrice,
  parseExposureSettings,
  toIsoDate,
  type ExposureFxInput,
  type ExposureHoldingInput,
  type ExposureInput,
  type ExposurePropertyInput,
  type ExposureReport,
  type ExposureSavingsInput,
  type ExposureSettings,
  type ExposureSettingsState,
  type HoldingValuePrice,
} from '@quro/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  exposureSettings,
  holdingTransactions,
  holdings,
  mortgages,
  properties,
  savingsAccounts,
} from '../db/schema';
import { FX_BASE_CURRENCY } from './currencyRateCache';
import { getStoredCurrentCurrencyRateRows } from './currencyRateSync';
import { computeSharesByHolding } from './netWorth';
import { toNumberOrZero } from './numbers';
import { getAcceptedPartnerId, loadHouseholdRows } from './partner';

const MS_PER_HOUR = 60 * 60 * 1000;

// Exposure values a holding at the price every other current figure uses.
function exposurePrice(value: HoldingValuePrice) {
  return { unitPrice: value.price, priceSource: value.source, priceStale: value.stale };
}

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
 * The open savings accounts and properties the caller can read: their own and an accepted partner's
 * joint rows, whole, because the facts apply the household share. A property's debt is its linked
 * active mortgage while the caller can read it, as in net worth.
 */
async function loadHouseholdInput(userId: number): Promise<{
  savingsAccounts: ExposureSavingsInput[];
  properties: ExposurePropertyInput[];
}> {
  const partnerId = await getAcceptedPartnerId(userId);
  const [accountRows, propertyRows, mortgageRows] = await Promise.all([
    loadHouseholdRows(savingsAccounts, userId, partnerId),
    loadHouseholdRows(properties, userId, partnerId),
    loadHouseholdRows(mortgages, userId, partnerId),
  ]);
  const mortgageById = new Map(mortgageRows.map((row) => [row.id, row]));
  return {
    savingsAccounts: accountRows.map((row) => ({
      id: row.id,
      name: row.name,
      bank: row.bank,
      currency: row.currency,
      balance: toNumberOrZero(row.balance),
      isJoint: row.isJoint,
    })),
    properties: propertyRows.map((row) => {
      const mortgage = row.mortgageId === null ? undefined : mortgageById.get(row.mortgageId);
      return {
        id: row.id,
        name: row.address,
        propertyType: row.propertyType,
        currency: row.currency,
        currentValue: toNumberOrZero(row.currentValue),
        isJoint: row.isJoint,
        mortgage: mortgage
          ? {
              id: mortgage.id,
              outstandingBalance: toNumberOrZero(mortgage.outstandingBalance),
              isJoint: mortgage.isJoint,
            }
          : null,
      };
    }),
  };
}

/**
 * The caller's own open holdings with the price in use, the shares held and the stored exchange
 * rates, plus the household's savings and property. Brokerage holdings are never joint, so a
 * partner's holdings are never part of it.
 */
async function loadExposureInput(
  userId: number,
  settingsState: ExposureSettingsState,
  now: Date = new Date(),
): Promise<ExposureInput> {
  const [holdingRows, transactions, rateRows, household] = await Promise.all([
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
    loadHouseholdInput(userId),
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
    ...exposurePrice(holdingValuePrice(row, now)),
    priceUpdatedAt: row.priceUpdatedAt ? row.priceUpdatedAt.toISOString() : null,
  }));
  return {
    asOf: toIsoDate(now),
    baseCurrency: FX_BASE_CURRENCY,
    settings: settingsState.settings,
    settingsSource: settingsState.source,
    holdings: inputs,
    ...household,
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
  return {
    facts,
    view: buildExposureView(facts),
    household: buildExposureHouseholdView(facts),
    settings,
  };
}

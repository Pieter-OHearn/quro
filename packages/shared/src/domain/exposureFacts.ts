import { fromCents, toCents } from '../utils/money.js';
import { holdingValue } from './holdings.js';
import {
  ASSET_CLASS_GROUP,
  MIX_GROUPS,
  UNCLASSIFIED,
  type AssetClass,
  type AssetClassKey,
  type MixGroup,
} from './exposureClasses.js';
import {
  EXPOSURE_DEFAULTS_VERSION,
  riskBandLabel,
  resolveRiskClass,
  type ConcentrationThresholdKey,
  type ExposureSettings,
  type ReferenceMixId,
} from './exposureSettings.js';

/**
 * The facts behind the Exposure view: a pure, deterministic calculation over a person's
 * holdings, the exchange rates and their settings. Every number the page shows is one of these
 * facts or is derived from them (see `buildExposureView`), and every fact says which inputs it
 * used, which method and version produced it and which settings it read, so a later explanation
 * can read the same document the charts do. Nothing here calls a service or reads the clock.
 */

export const EXPOSURE_FACTS_SCHEMA_VERSION = 1;
export const EXPOSURE_METHOD = { id: 'exposure-breakdown', version: '1.0.0' } as const;

export type FactUnit = 'EUR' | 'percent' | 'count' | 'index' | 'risk_class' | 'rate' | 'flag';

export type FactKind =
  'total' | 'amount' | 'share' | 'weight' | 'concentration' | 'check' | 'risk' | 'reference_range';

/** A value a fact used. `ref` points at an entry of `inputs` (`holding:12`, `fx:USD`) or a setting. */
export type FactInput = {
  ref: string;
  value: number | string | null;
  unit: FactUnit | 'text';
  /** The date of the value, for an exchange rate. */
  date?: string | null;
};

export type FactWarningCode =
  'price_stale' | 'fx_rate_stale' | 'unclassified' | 'holdings_without_risk_class';

export type Fact = {
  /** Stable across runs: the same question about the same data has the same id. */
  id: string;
  kind: FactKind;
  value: number | boolean | null;
  unit: FactUnit;
  inputs: FactInput[];
  method: { id: string; version: string };
  settingsVersion: number;
  /** Labels and limits the value is read with: a sector's name, a threshold, a range. */
  context: Record<string, number | string | boolean | null>;
  warnings: FactWarningCode[];
};

export type ExposureWarningCode =
  | 'fx_rate_missing'
  | 'price_missing'
  | 'fx_rate_stale'
  | 'price_stale'
  | 'unclassified_holdings'
  | 'nothing_to_value';

export type ExposureWarning = {
  code: ExposureWarningCode;
  /** `holding:12`, `fx:GBP` or `portfolio`. */
  subject: string;
};

export type ExposureHoldingInput = {
  id: number;
  name: string;
  ticker: string;
  currency: string;
  sector: string;
  itemType: string | null;
  assetClass: AssetClass | null;
  riskClassOverride: number | null;
  /** Shares held; a holding with none is closed and not part of the portfolio. */
  shares: number;
  /** The price in use: a price entered by hand wins over a synced one. */
  unitPrice: number | null;
  priceSource: 'synced' | 'manual';
  priceUpdatedAt: string | null;
  priceStale: boolean;
};

export type ExposureFxInput = {
  currency: string;
  /** Units of the base currency per unit of `currency`. */
  rate: number;
  sourceDate: string | null;
  updatedAt: string | null;
  stale: boolean;
};

export type ExposureInput = {
  asOf: string;
  baseCurrency: string;
  settings: ExposureSettings;
  settingsSource: 'default' | 'custom';
  holdings: readonly ExposureHoldingInput[];
  fxRates: readonly ExposureFxInput[];
};

export type ExposureHoldingFact = ExposureHoldingInput & {
  status: 'valued' | 'excluded';
  excludedReason: 'no_price' | 'no_fx_rate' | null;
  nativeValue: number | null;
  fxRate: number | null;
  valueEur: number | null;
  riskClass: number | null;
  riskSource: 'override' | 'default' | null;
};

export type ExposureFacts = {
  schema: 'quro.exposure.facts';
  schemaVersion: typeof EXPOSURE_FACTS_SCHEMA_VERSION;
  method: { id: string; version: string };
  asOf: string;
  baseCurrency: string;
  settings: { version: number; source: 'default' | 'custom'; defaultsVersion: string };
  inputs: { holdings: ExposureHoldingFact[]; fxRates: ExposureFxInput[] };
  facts: Fact[];
  warnings: ExposureWarning[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERCENT = 100;
const PERCENT_PRECISION = 100;
const HHI_SCALE = 10_000;
const TOP_HOLDINGS = 3;
const MIN_HOLDINGS_FOR_TOP_CHECK = 4;
const MIN_HOLDINGS_FOR_SPREAD_CHECK = 2;
const AVERAGE_PRECISION = 100;
const METHOD_VERSION = '1';

/** Sector labels that describe a fund's breadth rather than a sector; they cannot be "concentrated". */
const GENERIC_SECTORS = new Set(['diversified', 'unknown', 'unspecified', 'other', 'mixed']);

export function isGenericSector(sector: string): boolean {
  return GENERIC_SECTORS.has(sector.trim().toLowerCase());
}

export function sectorKey(sector: string): string {
  const key = sector
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
  return key || 'unspecified';
}

export function sectorLabel(sector: string): string {
  return sector.trim() || 'Unspecified';
}

function roundPercent(cents: number, totalCents: number): number {
  return Math.round((cents / totalCents) * PERCENT * PERCENT_PRECISION) / PERCENT_PRECISION;
}

function method(id: string) {
  return { id, version: METHOD_VERSION };
}

function holdingRef(id: number): string {
  return `holding:${id}`;
}

// ── Valuation ────────────────────────────────────────────────────────────────

type RateIndex = ReadonlyMap<string, ExposureFxInput>;

function excludedReason(
  holding: ExposureHoldingInput,
  rate: number | undefined,
): 'no_price' | 'no_fx_rate' | null {
  const price = holding.unitPrice;
  if (price === null || !Number.isFinite(price) || price <= 0) return 'no_price';
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return 'no_fx_rate';
  return null;
}

function valueHolding(
  holding: ExposureHoldingInput,
  rates: RateIndex,
  baseCurrency: string,
  settings: ExposureSettings,
): ExposureHoldingFact {
  const risk = resolveRiskClass(holding, settings);
  const rate = holding.currency === baseCurrency ? 1 : rates.get(holding.currency)?.rate;
  const base = {
    ...holding,
    nativeValue: null,
    fxRate: null,
    valueEur: null,
    riskClass: risk?.riskClass ?? null,
    riskSource: risk?.source ?? null,
  };
  const reason = excludedReason(holding, rate);
  if (reason !== null) return { ...base, status: 'excluded', excludedReason: reason };
  const nativeValue = holdingValue(holding.shares, holding.unitPrice!);
  return {
    ...base,
    status: 'valued',
    excludedReason: null,
    nativeValue,
    fxRate: rate!,
    valueEur: fromCents(toCents(nativeValue * rate!)),
  };
}

type Valued = ExposureHoldingFact & { valueEur: number };

function isValued(holding: ExposureHoldingFact): holding is Valued {
  return holding.status === 'valued' && holding.valueEur !== null;
}

// ── Fact builders ────────────────────────────────────────────────────────────

type FactDraft = Pick<Fact, 'id' | 'kind' | 'value' | 'unit'> &
  Partial<Pick<Fact, 'inputs' | 'context' | 'warnings'>> & { methodId: string };

class FactBook {
  readonly facts: Fact[] = [];

  constructor(private readonly settingsVersion: number) {}

  add(draft: FactDraft): void {
    this.facts.push({
      id: draft.id,
      kind: draft.kind,
      value: draft.value,
      unit: draft.unit,
      inputs: draft.inputs ?? [],
      method: method(draft.methodId),
      settingsVersion: this.settingsVersion,
      context: draft.context ?? {},
      warnings: draft.warnings ?? [],
    });
  }
}

function valueInputs(holdings: readonly Valued[]): FactInput[] {
  return holdings.map((holding) => ({
    ref: holdingRef(holding.id),
    value: holding.valueEur,
    unit: 'EUR' as const,
  }));
}

function fxInputs(holdings: readonly Valued[], rates: RateIndex): FactInput[] {
  const currencies = [...new Set(holdings.map((holding) => holding.currency))].sort();
  return currencies.flatMap((currency) => {
    const rate = rates.get(currency);
    return rate
      ? [{ ref: `fx:${currency}`, value: rate.rate, unit: 'rate' as const, date: rate.sourceDate }]
      : [];
  });
}

function warningsFor(
  holdings: readonly Valued[],
  rates: RateIndex,
  options: { classification?: boolean } = {},
): FactWarningCode[] {
  const codes = new Set<FactWarningCode>();
  for (const holding of holdings) {
    if (holding.priceStale) codes.add('price_stale');
    if (rates.get(holding.currency)?.stale) codes.add('fx_rate_stale');
    if (options.classification && holding.assetClass === null) codes.add('unclassified');
  }
  return [...codes].sort();
}

type Bucket = { label: string; cents: number; holdings: Valued[] };

function groupBy(holdings: readonly Valued[], keyOf: (h: Valued) => [string, string]) {
  const buckets = new Map<string, Bucket>();
  for (const holding of holdings) {
    const [key, label] = keyOf(holding);
    const bucket = buckets.get(key) ?? { label, cents: 0, holdings: [] };
    bucket.cents += toCents(holding.valueEur);
    bucket.holdings.push(holding);
    buckets.set(key, bucket);
  }
  return buckets;
}

type Scope = {
  book: FactBook;
  valued: readonly Valued[];
  totalCents: number;
  rates: RateIndex;
  settings: ExposureSettings;
  baseCurrency: string;
};

function addAmountAndShare(
  scope: Scope,
  prefix: string,
  bucket: Bucket,
  context: Fact['context'],
  classification: boolean,
): void {
  const inputs = [...valueInputs(bucket.holdings), ...fxInputs(bucket.holdings, scope.rates)];
  const warnings = warningsFor(bucket.holdings, scope.rates, { classification });
  scope.book.add({
    id: `${prefix}.value`,
    kind: 'amount',
    value: fromCents(bucket.cents),
    unit: 'EUR',
    methodId: 'sum_cents',
    inputs,
    context,
    warnings,
  });
  scope.book.add({
    id: `${prefix}.share`,
    kind: 'share',
    value: roundPercent(bucket.cents, scope.totalCents),
    unit: 'percent',
    methodId: 'share_of_total',
    inputs: [{ ref: 'fact:exposure.total_value', value: fromCents(scope.totalCents), unit: 'EUR' }],
    context,
    warnings,
  });
}

function addTotals(scope: Scope): void {
  scope.book.add({
    id: 'exposure.total_value',
    kind: 'total',
    value: fromCents(scope.totalCents),
    unit: 'EUR',
    methodId: 'sum_cents',
    inputs: [...valueInputs(scope.valued), ...fxInputs(scope.valued, scope.rates)],
    warnings: warningsFor(scope.valued, scope.rates),
  });
  for (const holding of scope.valued) {
    scope.book.add({
      id: `exposure.holding.${holding.id}.weight`,
      kind: 'weight',
      value: roundPercent(toCents(holding.valueEur), scope.totalCents),
      unit: 'percent',
      methodId: 'share_of_total',
      inputs: [
        { ref: holdingRef(holding.id), value: holding.valueEur, unit: 'EUR' },
        { ref: 'fact:exposure.total_value', value: fromCents(scope.totalCents), unit: 'EUR' },
      ],
      context: { holdingId: holding.id },
      warnings: warningsFor([holding], scope.rates),
    });
  }
}

function assetClassKey(holding: Valued): AssetClassKey {
  return holding.assetClass ?? UNCLASSIFIED;
}

function addBreakdowns(scope: Scope): void {
  const byClass = groupBy(scope.valued, (h) => [assetClassKey(h), assetClassKey(h)]);
  for (const [key, bucket] of byClass) {
    addAmountAndShare(scope, `exposure.asset_class.${key}`, bucket, { assetClass: key }, true);
  }
  const groupCents = new Map<MixGroup, Bucket>();
  for (const group of MIX_GROUPS) groupCents.set(group, { label: group, cents: 0, holdings: [] });
  for (const holding of scope.valued) {
    if (holding.assetClass === null) continue;
    const bucket = groupCents.get(ASSET_CLASS_GROUP[holding.assetClass])!;
    bucket.cents += toCents(holding.valueEur);
    bucket.holdings.push(holding);
  }
  for (const [group, bucket] of groupCents) {
    scope.book.add({
      id: `exposure.group.${group}.share`,
      kind: 'share',
      value: roundPercent(bucket.cents, scope.totalCents),
      unit: 'percent',
      methodId: 'share_of_total',
      inputs: valueInputs(bucket.holdings),
      context: { group },
      warnings: warningsFor(bucket.holdings, scope.rates),
    });
  }
  const byCurrency = groupBy(scope.valued, (h) => [h.currency, h.currency]);
  for (const [currency, bucket] of byCurrency) {
    addAmountAndShare(scope, `exposure.currency.${currency}`, bucket, { currency }, false);
  }
  const bySector = groupBy(scope.valued, (h) => [sectorKey(h.sector), sectorLabel(h.sector)]);
  for (const [key, bucket] of bySector) {
    const context = { sector: bucket.label, generic: isGenericSector(bucket.label) };
    addAmountAndShare(scope, `exposure.sector.${key}`, bucket, context, false);
  }
}

// ── Concentration ────────────────────────────────────────────────────────────

type Measure = { percent: number; ids: number[]; label: string | null };

function largestHolding(scope: Scope): Measure {
  const top = scope.valued[0];
  return {
    percent: roundPercent(toCents(top.valueEur), scope.totalCents),
    ids: [top.id],
    label: top.name,
  };
}

function topThree(scope: Scope): Measure {
  const top = scope.valued.slice(0, TOP_HOLDINGS);
  const cents = top.reduce((sum, holding) => sum + toCents(holding.valueEur), 0);
  return { percent: roundPercent(cents, scope.totalCents), ids: top.map((h) => h.id), label: null };
}

function largestBucket(
  scope: Scope,
  keyOf: (h: Valued) => [string, string],
  include: (label: string) => boolean,
): Measure | null {
  let best: { label: string; cents: number; ids: number[] } | null = null;
  for (const bucket of groupBy(scope.valued, keyOf).values()) {
    if (!include(bucket.label)) continue;
    if (best === null || bucket.cents > best.cents) {
      best = { label: bucket.label, cents: bucket.cents, ids: bucket.holdings.map((h) => h.id) };
    }
  }
  return best
    ? { percent: roundPercent(best.cents, scope.totalCents), ids: best.ids, label: best.label }
    : null;
}

const CHECK_SETTING_KEY: Record<string, ConcentrationThresholdKey> = {
  single_holding: 'singleHoldingPct',
  top_three: 'topThreePct',
  sector: 'sectorPct',
  currency: 'currencyPct',
};

function addCheck(
  scope: Scope,
  id: string,
  measure: Measure | null,
  threshold: number,
  applicable: boolean,
): void {
  const enabled = scope.settings.noticesEnabled[CHECK_SETTING_KEY[id]];
  const measured = measure?.percent ?? null;
  scope.book.add({
    id: `exposure.check.${id}`,
    kind: 'check',
    value: enabled && applicable && measured !== null ? measured > threshold : false,
    unit: 'flag',
    methodId: 'threshold_check',
    inputs: [
      { ref: `fact:exposure.concentration.${id}`, value: measured, unit: 'percent' },
      { ref: `setting:thresholds.${CHECK_SETTING_KEY[id]}`, value: threshold, unit: 'percent' },
      {
        ref: `setting:noticesEnabled.${CHECK_SETTING_KEY[id]}`,
        value: enabled ? 1 : 0,
        unit: 'flag',
      },
    ],
    context: {
      measured,
      threshold,
      enabled,
      applicable,
      subject: measure?.label ?? null,
    },
  });
}

function addConcentration(scope: Scope): void {
  const count = scope.valued.length;
  const fractions = scope.valued.map((h) => toCents(h.valueEur) / scope.totalCents);
  const hhi = fractions.reduce((sum, fraction) => sum + fraction * fraction, 0) * HHI_SCALE;
  scope.book.add({
    id: 'exposure.concentration.hhi',
    kind: 'concentration',
    value: Math.round(hhi * AVERAGE_PRECISION) / AVERAGE_PRECISION,
    unit: 'index',
    methodId: 'hhi',
    inputs: valueInputs(scope.valued),
  });
  scope.book.add({
    id: 'exposure.concentration.effective_holdings',
    kind: 'concentration',
    value: Math.round((HHI_SCALE / hhi) * AVERAGE_PRECISION) / AVERAGE_PRECISION,
    unit: 'count',
    methodId: 'effective_number_of_holdings',
    inputs: [{ ref: 'fact:exposure.concentration.hhi', value: hhi, unit: 'index' }],
    context: { holdings: count },
  });
  const single = largestHolding(scope);
  const three = topThree(scope);
  const sector = largestBucket(
    scope,
    (h) => [sectorKey(h.sector), sectorLabel(h.sector)],
    (l) => !isGenericSector(l),
  );
  const currency = largestBucket(
    scope,
    (h) => [h.currency, h.currency],
    (l) => l !== scope.baseCurrency,
  );
  const { thresholds } = scope.settings;
  const measures: [string, Measure | null, number, boolean][] = [
    ['single_holding', single, thresholds.singleHoldingPct, true],
    ['top_three', three, thresholds.topThreePct, count >= MIN_HOLDINGS_FOR_TOP_CHECK],
    ['sector', sector, thresholds.sectorPct, count >= MIN_HOLDINGS_FOR_SPREAD_CHECK],
    ['currency', currency, thresholds.currencyPct, count >= MIN_HOLDINGS_FOR_SPREAD_CHECK],
  ];
  for (const [id, measure, ,] of measures) {
    scope.book.add({
      id: `exposure.concentration.${id}`,
      kind: 'concentration',
      value: measure?.percent ?? null,
      unit: 'percent',
      methodId: 'largest_share',
      inputs: (measure?.ids ?? []).map((holdingId) => ({
        ref: holdingRef(holdingId),
        value: scope.valued.find((h) => h.id === holdingId)!.valueEur,
        unit: 'EUR' as const,
      })),
      context: { subject: measure?.label ?? null },
    });
  }
  for (const [id, measure, threshold, applicable] of measures) {
    addCheck(scope, id, measure, threshold, applicable);
  }
}

// ── Risk and reference mix ───────────────────────────────────────────────────

function addRisk(scope: Scope): void {
  const rated = scope.valued.filter((h) => h.riskClass !== null);
  const ratedCents = rated.reduce((sum, h) => sum + toCents(h.valueEur), 0);
  const unrated = scope.valued.length - rated.length;
  const average =
    ratedCents > 0
      ? rated.reduce((sum, h) => sum + h.riskClass! * toCents(h.valueEur), 0) / ratedCents
      : null;
  scope.book.add({
    id: 'exposure.risk.weighted_average',
    kind: 'risk',
    value: average === null ? null : Math.round(average * AVERAGE_PRECISION) / AVERAGE_PRECISION,
    unit: 'risk_class',
    methodId: 'weighted_average_risk',
    inputs: rated.map((h) => ({
      ref: holdingRef(h.id),
      value: h.riskClass,
      unit: 'risk_class' as const,
    })),
    context: {
      band: average === null ? null : riskBandLabel(average),
      roundedClass: average === null ? null : Math.round(average),
      holdingsWithoutRiskClass: unrated,
    },
    warnings: unrated > 0 ? ['holdings_without_risk_class'] : [],
  });
  scope.book.add({
    id: 'exposure.risk.coverage',
    kind: 'share',
    value: roundPercent(ratedCents, scope.totalCents),
    unit: 'percent',
    methodId: 'share_of_total',
    inputs: [{ ref: 'fact:exposure.total_value', value: fromCents(scope.totalCents), unit: 'EUR' }],
  });
}

function mixStatus(share: number, min: number, max: number): 'below' | 'within' | 'above' {
  if (share < min) return 'below';
  return share > max ? 'above' : 'within';
}

function addReferenceMix(scope: Scope, mixId: ReferenceMixId | null): void {
  if (mixId === null) return;
  const mix = scope.settings.referenceMixes[mixId];
  for (const group of MIX_GROUPS) {
    const share = scope.book.facts.find((fact) => fact.id === `exposure.group.${group}.share`)!;
    const value = share.value as number;
    scope.book.add({
      id: `exposure.reference_mix.${group}`,
      kind: 'reference_range',
      value,
      unit: 'percent',
      methodId: 'reference_range_check',
      inputs: [
        { ref: `fact:exposure.group.${group}.share`, value, unit: 'percent' },
        {
          ref: `setting:referenceMixes.${mixId}.${group}.min`,
          value: mix[group].min,
          unit: 'percent',
        },
        {
          ref: `setting:referenceMixes.${mixId}.${group}.max`,
          value: mix[group].max,
          unit: 'percent',
        },
      ],
      context: {
        mix: mixId,
        min: mix[group].min,
        max: mix[group].max,
        status: mixStatus(value, mix[group].min, mix[group].max),
      },
    });
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

function collectWarnings(
  holdings: readonly ExposureHoldingFact[],
  rates: RateIndex,
  valued: readonly Valued[],
): ExposureWarning[] {
  const warnings: ExposureWarning[] = [];
  for (const holding of holdings) {
    const subject = holdingRef(holding.id);
    if (holding.excludedReason === 'no_price') warnings.push({ code: 'price_missing', subject });
    if (holding.excludedReason === 'no_fx_rate') {
      warnings.push({ code: 'fx_rate_missing', subject: `fx:${holding.currency}` });
    }
    if (holding.status === 'valued' && holding.priceStale) {
      warnings.push({ code: 'price_stale', subject });
    }
  }
  const usedStale = new Set(
    valued.filter((h) => rates.get(h.currency)?.stale).map((h) => h.currency),
  );
  for (const currency of [...usedStale].sort()) {
    warnings.push({ code: 'fx_rate_stale', subject: `fx:${currency}` });
  }
  if (valued.some((h) => h.assetClass === null)) {
    warnings.push({ code: 'unclassified_holdings', subject: 'portfolio' });
  }
  const worth = valued.reduce((sum, holding) => sum + toCents(holding.valueEur), 0);
  if (worth === 0) warnings.push({ code: 'nothing_to_value', subject: 'portfolio' });
  return dedupe(warnings);
}

function dedupe(warnings: ExposureWarning[]): ExposureWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}|${warning.subject}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function byValueDescending(left: Valued, right: Valued): number {
  return toCents(right.valueEur) - toCents(left.valueEur) || left.id - right.id;
}

/**
 * Works out the facts for one person's open holdings. Holdings without shares are left out;
 * a holding with no usable price or no exchange rate is kept in `inputs` as excluded and named in
 * `warnings`, never valued by guesswork. Money is summed in integer cents and shares of the total
 * are rounded to two decimals once.
 */
export function computeExposureFacts(input: ExposureInput): ExposureFacts {
  const rates: RateIndex = new Map(input.fxRates.map((rate) => [rate.currency, rate]));
  const open = input.holdings.filter((holding) => holding.shares > 0);
  const holdings = open.map((h) => valueHolding(h, rates, input.baseCurrency, input.settings));
  const valued = holdings.filter(isValued).sort(byValueDescending);
  const totalCents = valued.reduce((sum, holding) => sum + toCents(holding.valueEur), 0);
  const book = new FactBook(input.settings.version);
  if (valued.length > 0 && totalCents > 0) {
    const scope: Scope = {
      book,
      valued,
      totalCents,
      rates,
      settings: input.settings,
      baseCurrency: input.baseCurrency,
    };
    addTotals(scope);
    addBreakdowns(scope);
    addConcentration(scope);
    addRisk(scope);
    addReferenceMix(scope, input.settings.selectedMix);
  } else {
    book.add({
      id: 'exposure.total_value',
      kind: 'total',
      value: 0,
      unit: 'EUR',
      methodId: 'sum_cents',
    });
  }
  const usedRates = input.fxRates.filter((rate) => open.some((h) => h.currency === rate.currency));
  return {
    schema: 'quro.exposure.facts',
    schemaVersion: EXPOSURE_FACTS_SCHEMA_VERSION,
    method: EXPOSURE_METHOD,
    asOf: input.asOf,
    baseCurrency: input.baseCurrency,
    settings: {
      version: input.settings.version,
      source: input.settingsSource,
      defaultsVersion: EXPOSURE_DEFAULTS_VERSION,
    },
    inputs: { holdings: sortHoldings(holdings), fxRates: [...usedRates].sort(byCurrency) },
    facts: book.facts,
    warnings: collectWarnings(holdings, rates, valued),
  };
}

function byCurrency(left: ExposureFxInput, right: ExposureFxInput): number {
  return left.currency.localeCompare(right.currency);
}

function sortHoldings(holdings: ExposureHoldingFact[]): ExposureHoldingFact[] {
  return [...holdings].sort(
    (left, right) =>
      toCents(right.valueEur ?? 0) - toCents(left.valueEur ?? 0) || left.id - right.id,
  );
}

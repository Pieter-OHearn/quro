/* eslint-disable no-magic-numbers -- the defaults below are data: every number is a published or assumed reference value with its source next to it. */
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  MIX_GROUPS,
  MIX_GROUP_LABELS,
  type AssetClass,
  type MixGroup,
  isAssetClass,
} from './exposureClasses.js';

/**
 * What the Exposure view compares a portfolio with, and where each default comes from. A user can
 * change every value below; a reset restores these. The numbers describe a mix and a scale, they
 * are not advice, and the ones without a published source say so.
 */

/** The shape of the stored settings document. A new shape gets a new number. */
export const EXPOSURE_SETTINGS_VERSION = 1;

/** When the defaults below were last reviewed. They are reviewed once a year. */
export const EXPOSURE_DEFAULTS_VERSION = '2026-10-18';

export const REFERENCE_MIX_IDS = ['A', 'B', 'C', 'D'] as const;
export type ReferenceMixId = (typeof REFERENCE_MIX_IDS)[number];

export function referenceMixName(id: ReferenceMixId): string {
  return `Reference mix ${id}`;
}

export type PercentRange = { min: number; max: number };
export type ReferenceMix = Record<MixGroup, PercentRange>;

export const CONCENTRATION_THRESHOLD_KEYS = [
  'singleHoldingPct',
  'topThreePct',
  'sectorPct',
  'currencyPct',
] as const;
export type ConcentrationThresholdKey = (typeof CONCENTRATION_THRESHOLD_KEYS)[number];

export type ExposureSettings = {
  version: typeof EXPOSURE_SETTINGS_VERSION;
  /** Default risk class (1 to 7) per asset class; null means the class has no default. */
  riskByAssetClass: Record<AssetClass, number | null>;
  referenceMixes: Record<ReferenceMixId, ReferenceMix>;
  /** The mix drawn over the asset class bar, or null for none. */
  selectedMix: ReferenceMixId | null;
  /** Percent of the portfolio above which a concentration notice is shown. */
  thresholds: Record<ConcentrationThresholdKey, number>;
  /** Which notices are shown. A notice that is off is not raised; its breakdown stays. */
  noticesEnabled: Record<ConcentrationThresholdKey, boolean>;
};

export const MIN_RISK_CLASS = 1;
export const MAX_RISK_CLASS = 7;

/** Bands for the 1 to 7 scale. They label a class; they do not rate a person's choices. */
export const RISK_BAND_LABELS: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Low to medium',
  4: 'Medium',
  5: 'Medium to high',
  6: 'High',
  7: 'Very high',
};

export function riskBandLabel(riskClass: number): string {
  const clamped = Math.min(MAX_RISK_CLASS, Math.max(MIN_RISK_CLASS, Math.round(riskClass)));
  return RISK_BAND_LABELS[clamped];
}

const RISK_DEFAULTS: Record<AssetClass, { value: number | null; range: [number, number] | null }> =
  {
    cash_money_market: { value: 1, range: [1, 2] },
    bond_short_government: { value: 2, range: [1, 3] },
    bond_investment_grade: { value: 3, range: [2, 4] },
    bond_long_government: { value: 4, range: [3, 5] },
    bond_high_yield: { value: 4, range: [4, 5] },
    equity_developed: { value: 4, range: [4, 5] },
    equity_emerging: { value: 5, range: [4, 6] },
    gold_commodities: { value: 5, range: [4, 6] },
    property_reits: { value: 5, range: [4, 5] },
    crypto: { value: 7, range: [6, 7] },
    other: { value: null, range: null },
  };

/** The usual spread around a default class, shown beside the field. Null when there is none. */
export function defaultRiskRange(assetClass: AssetClass): readonly [number, number] | null {
  return RISK_DEFAULTS[assetClass].range;
}

const DEFAULT_MIXES: Record<ReferenceMixId, ReferenceMix> = {
  A: {
    stocks: { min: 20, max: 40 },
    bonds: { min: 55, max: 80 },
    cash: { min: 0, max: 10 },
    other: { min: 0, max: 5 },
  },
  B: {
    stocks: { min: 40, max: 60 },
    bonds: { min: 35, max: 55 },
    cash: { min: 0, max: 10 },
    other: { min: 0, max: 5 },
  },
  C: {
    stocks: { min: 60, max: 80 },
    bonds: { min: 15, max: 35 },
    cash: { min: 0, max: 5 },
    other: { min: 0, max: 5 },
  },
  D: {
    stocks: { min: 80, max: 100 },
    bonds: { min: 0, max: 20 },
    cash: { min: 0, max: 5 },
    other: { min: 0, max: 5 },
  },
};

const DEFAULT_THRESHOLDS: Record<ConcentrationThresholdKey, number> = {
  singleHoldingPct: 10,
  topThreePct: 40,
  sectorPct: 30,
  currencyPct: 50,
};

// The currency notice is off by default: a euro-based person who holds a global fund is mostly
// exposed to other currencies, so the notice would fire for almost everyone. The breakdown by
// currency is always shown, and the notice can be switched on with its own threshold.
const DEFAULT_NOTICES_ENABLED: Record<ConcentrationThresholdKey, boolean> = {
  singleHoldingPct: true,
  topThreePct: true,
  sectorPct: true,
  currencyPct: false,
};

function buildDefaultSettings(): ExposureSettings {
  return {
    version: EXPOSURE_SETTINGS_VERSION,
    riskByAssetClass: Object.fromEntries(
      ASSET_CLASSES.map((assetClass) => [assetClass, RISK_DEFAULTS[assetClass].value]),
    ) as ExposureSettings['riskByAssetClass'],
    referenceMixes: structuredClone(DEFAULT_MIXES),
    selectedMix: null,
    thresholds: { ...DEFAULT_THRESHOLDS },
    noticesEnabled: { ...DEFAULT_NOTICES_ENABLED },
  };
}

/** A fresh copy of the defaults, safe to edit. */
export function defaultExposureSettings(): ExposureSettings {
  return buildDefaultSettings();
}

export type DefaultBasis = 'published' | 'assumption';

export type DefaultSource = {
  id: string;
  /** What the default applies to, in words. */
  covers: string;
  basis: DefaultBasis;
  /** Where it comes from, or why it is an assumption. */
  source: string;
  /** The date of the source or of our review, as written by the source. */
  versionDate: string;
};

const RISK_SCALE_SOURCE =
  'EU PRIIPs Delegated Regulation 2017/653, Annex II (summary risk indicator, classes 1 to 7); CESR/10-673 for the UCITS indicator before 2023';
const RISK_SCALE_VERSION = 'Annex II text of 2017 as amended for 2023; CESR/10-673 of 2010';
const NO_MAPPING_NOTE =
  'Our assumption: no regulator publishes a mapping from asset class to the 1 to 7 scale. A fund reports its own class in its KID, and that value overrides this default.';

const MIX_SOURCES: Record<ReferenceMixId, { source: string; versionDate: string }> = {
  A: {
    source:
      'Stocks and bonds ranges span Vanguard UK LifeStrategy 20% and 40% equity and BlackRock iShares Core Allocation Conservative (30/70). Cash and other ranges are our assumption.',
    versionDate: 'Vanguard UK data 30 Sep 2026; iShares 2026-07',
  },
  B: {
    source:
      'Stocks and bonds ranges span Vanguard UK LifeStrategy 40% and 60% equity, iShares Core Allocation Moderate (40/60) and the classic 60/40 mix. Cash and other ranges are our assumption.',
    versionDate: 'Vanguard UK data 30 Sep 2026; iShares 2026-07',
  },
  C: {
    source:
      'Stocks and bonds ranges span Vanguard UK LifeStrategy 60% and 80% equity and iShares Core Allocation Growth (60/40). Cash and other ranges are our assumption.',
    versionDate: 'Vanguard UK data 30 Sep 2026; iShares 2026-07',
  },
  D: {
    source:
      'Stocks and bonds ranges span Vanguard UK LifeStrategy 80% and 100% equity and iShares Core Allocation Aggressive (80/20). Cash and other ranges are our assumption.',
    versionDate: 'Vanguard UK data 30 Sep 2026; iShares 2026-07',
  },
};

export const THRESHOLD_LABELS: Record<ConcentrationThresholdKey, string> = {
  singleHoldingPct: 'One holding',
  topThreePct: 'Three largest holdings',
  sectorPct: 'One sector',
  currencyPct: 'One currency outside EUR',
};

const THRESHOLD_SOURCES: { key: ConcentrationThresholdKey; covers: string; source: string }[] = [
  {
    key: 'singleHoldingPct',
    covers: 'Notice for one holding',
    source:
      'A common rule of thumb puts the line at 10 to 20% in one holding (secondary source); no regulator publishes a figure for individuals. UCITS limits apply to funds, not to people.',
  },
  {
    key: 'topThreePct',
    covers: 'Notice for the three largest holdings',
    source: 'Our assumption; no authoritative threshold exists.',
  },
  {
    key: 'sectorPct',
    covers: 'Notice for one sector',
    source: 'Our assumption; no reputable threshold was found.',
  },
  {
    key: 'currencyPct',
    covers: 'Notice for one currency other than EUR (off by default)',
    source:
      'Our assumption; no reputable threshold was found. The notice is off by default because a person based in euros who holds a global fund is mostly exposed to other currencies.',
  },
];

function riskSources(): DefaultSource[] {
  return ASSET_CLASSES.map((assetClass) => ({
    id: `risk.${assetClass}`,
    covers: `Default risk class: ${assetClass}`,
    basis: 'assumption' as const,
    source: NO_MAPPING_NOTE,
    versionDate: EXPOSURE_DEFAULTS_VERSION,
  }));
}

/** Every default with its source and version date. Shown in "How this is worked out". */
export const EXPOSURE_DEFAULT_SOURCES: readonly DefaultSource[] = [
  {
    id: 'risk.scale',
    covers: 'The 1 to 7 risk scale and its bands',
    basis: 'published',
    source: RISK_SCALE_SOURCE,
    versionDate: RISK_SCALE_VERSION,
  },
  ...riskSources(),
  ...REFERENCE_MIX_IDS.map((id) => ({
    id: `mix.${id}`,
    covers: referenceMixName(id),
    basis: 'published' as const,
    source: MIX_SOURCES[id].source,
    versionDate: MIX_SOURCES[id].versionDate,
  })),
  ...THRESHOLD_SOURCES.map(({ key, covers, source }) => ({
    id: `threshold.${key}`,
    covers,
    basis: 'assumption' as const,
    source,
    versionDate: EXPOSURE_DEFAULTS_VERSION,
  })),
];

// ── Validation ───────────────────────────────────────────────────────────────

export type ExposureSettingsResult =
  { ok: true; value: ExposureSettings } | { ok: false; errors: string[] };

const PERCENT_DECIMALS = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

function parsePercent(value: unknown, label: string, errors: string[]): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    errors.push(`${label} must be a number from 0 to 100`);
    return 0;
  }
  return Math.round(value * PERCENT_DECIMALS) / PERCENT_DECIMALS;
}

function parseRisk(value: unknown, label: string, errors: string[]): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_RISK_CLASS ||
    value > MAX_RISK_CLASS
  ) {
    errors.push(`${label} must be a whole number from 1 to 7, or empty`);
    return null;
  }
  return value;
}

function parseRiskMap(raw: unknown, errors: string[]): ExposureSettings['riskByAssetClass'] {
  const result = {} as ExposureSettings['riskByAssetClass'];
  const source = isPlainObject(raw) ? raw : {};
  if (!isPlainObject(raw)) errors.push('Risk classes must be an object');
  else if (unknownKeys(raw, ASSET_CLASSES).length > 0)
    errors.push('Risk classes name an unknown asset class');
  for (const assetClass of ASSET_CLASSES) {
    if (!(assetClass in source)) {
      errors.push(`Risk class for ${ASSET_CLASS_LABELS[assetClass]} is missing`);
      result[assetClass] = null;
    } else {
      result[assetClass] = parseRisk(
        source[assetClass],
        `Risk class for ${ASSET_CLASS_LABELS[assetClass]}`,
        errors,
      );
    }
  }
  return result;
}

function parseRange(raw: unknown, label: string, errors: string[]): PercentRange {
  if (!isPlainObject(raw) || unknownKeys(raw, ['min', 'max']).length > 0) {
    errors.push(`${label} must have a minimum and a maximum`);
    return { min: 0, max: 0 };
  }
  const min = parsePercent(raw.min, `${label} minimum`, errors);
  const max = parsePercent(raw.max, `${label} maximum`, errors);
  if (min > max) errors.push(`${label} minimum cannot be above its maximum`);
  return { min, max };
}

function parseMix(raw: unknown, id: ReferenceMixId, errors: string[]): ReferenceMix {
  const name = referenceMixName(id);
  const mix = {} as ReferenceMix;
  const source = isPlainObject(raw) ? raw : {};
  if (!isPlainObject(raw) || unknownKeys(raw, MIX_GROUPS).length > 0) {
    errors.push(`${name} must list stocks, bonds, cash and other`);
  }
  for (const group of MIX_GROUPS)
    mix[group] = parseRange(
      source[group],
      `${name}, ${MIX_GROUP_LABELS[group].toLowerCase()}`,
      errors,
    );
  const minTotal = MIX_GROUPS.reduce((sum, group) => sum + mix[group].min, 0);
  const maxTotal = MIX_GROUPS.reduce((sum, group) => sum + mix[group].max, 0);
  if (minTotal > 100) errors.push(`${name} minimums add up to more than 100%`);
  if (maxTotal < 100) errors.push(`${name} maximums add up to less than 100%`);
  return mix;
}

function parseMixes(raw: unknown, errors: string[]): ExposureSettings['referenceMixes'] {
  const source = isPlainObject(raw) ? raw : {};
  if (!isPlainObject(raw) || unknownKeys(raw, REFERENCE_MIX_IDS).length > 0) {
    errors.push('Reference mixes must be A, B, C and D');
  }
  return Object.fromEntries(
    REFERENCE_MIX_IDS.map((id) => [id, parseMix(source[id], id, errors)]),
  ) as ExposureSettings['referenceMixes'];
}

function parseThresholds(raw: unknown, errors: string[]): ExposureSettings['thresholds'] {
  const source = isPlainObject(raw) ? raw : {};
  if (!isPlainObject(raw) || unknownKeys(raw, CONCENTRATION_THRESHOLD_KEYS).length > 0) {
    errors.push('Thresholds must be the four concentration limits');
  }
  return Object.fromEntries(
    CONCENTRATION_THRESHOLD_KEYS.map((key) => [
      key,
      parsePercent(source[key], `Threshold for ${THRESHOLD_LABELS[key].toLowerCase()}`, errors),
    ]),
  ) as ExposureSettings['thresholds'];
}

function parseNoticesEnabled(raw: unknown, errors: string[]): ExposureSettings['noticesEnabled'] {
  const source = isPlainObject(raw) ? raw : {};
  if (!isPlainObject(raw) || unknownKeys(raw, CONCENTRATION_THRESHOLD_KEYS).length > 0) {
    errors.push('Notices must say, for each of the four concentration limits, whether it is on');
  }
  return Object.fromEntries(
    CONCENTRATION_THRESHOLD_KEYS.map((key) => {
      if (typeof source[key] !== 'boolean') {
        errors.push(`The notice for ${THRESHOLD_LABELS[key].toLowerCase()} must be on or off`);
      }
      return [key, source[key] === true];
    }),
  ) as ExposureSettings['noticesEnabled'];
}

/**
 * Checks a settings document and returns it normalised (percentages to two decimals), or every
 * problem found. Unknown keys are refused so a typo cannot be stored and silently ignored.
 */
export function parseExposureSettings(raw: unknown): ExposureSettingsResult {
  if (!isPlainObject(raw)) return { ok: false, errors: ['Settings must be an object'] };
  const errors: string[] = [];
  const extra = unknownKeys(raw, [
    'version',
    'riskByAssetClass',
    'referenceMixes',
    'selectedMix',
    'thresholds',
    'noticesEnabled',
  ]);
  if (extra.length > 0) errors.push(`Unknown settings: ${extra.join(', ')}`);
  if (raw.version !== EXPOSURE_SETTINGS_VERSION) {
    errors.push(`Settings version must be ${EXPOSURE_SETTINGS_VERSION}`);
  }
  const selectedMix = raw.selectedMix ?? null;
  if (selectedMix !== null && !REFERENCE_MIX_IDS.includes(selectedMix as ReferenceMixId)) {
    errors.push('The selected mix must be A, B, C, D or none');
  }
  const value: ExposureSettings = {
    version: EXPOSURE_SETTINGS_VERSION,
    riskByAssetClass: parseRiskMap(raw.riskByAssetClass, errors),
    referenceMixes: parseMixes(raw.referenceMixes, errors),
    selectedMix: errors.length === 0 ? (selectedMix as ReferenceMixId | null) : null,
    thresholds: parseThresholds(raw.thresholds, errors),
    noticesEnabled: parseNoticesEnabled(raw.noticesEnabled, errors),
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** The risk class a holding counts with: its own, else the default for its class. */
export function resolveRiskClass(
  holding: { assetClass: AssetClass | null; riskClassOverride: number | null },
  settings: ExposureSettings,
): { riskClass: number; source: 'override' | 'default' } | null {
  if (holding.riskClassOverride != null) {
    return { riskClass: holding.riskClassOverride, source: 'override' };
  }
  if (holding.assetClass !== null && isAssetClass(holding.assetClass)) {
    const riskClass = settings.riskByAssetClass[holding.assetClass];
    if (riskClass != null) return { riskClass, source: 'default' };
  }
  return null;
}

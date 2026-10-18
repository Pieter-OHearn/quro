import {
  ASSET_CLASS_LABELS,
  MIX_GROUPS,
  MIX_GROUP_LABELS,
  UNCLASSIFIED,
  type AssetClass,
  type AssetClassKey,
  ASSET_CLASS_GROUP,
  type MixGroup,
} from './exposureClasses.js';
import { type ExposureFacts, type ExposureWarning, type Fact } from './exposureFacts.js';
import {
  riskBandLabel,
  referenceMixName,
  type ExposureSettings,
  type ReferenceMixId,
} from './exposureSettings.js';

/**
 * The render-ready breakdowns of the Exposure view, derived from the facts and nothing else: a
 * chart, a table or a later explanation that reads these numbers reads the same facts. The wording
 * describes the mix. It never says what to do, and it names no product.
 */

export type ExposureHoldingRow = {
  id: number;
  name: string;
  ticker: string;
  currency: string;
  sector: string;
  itemType: string | null;
  assetClass: AssetClass | null;
  riskClass: number | null;
  riskSource: 'override' | 'default' | null;
  unitPrice: number;
  priceSource: 'synced' | 'manual';
  priceStale: boolean;
  nativeValue: number;
  valueEur: number;
  /** Percent of the invested total. */
  weight: number;
};

export type ExposureExcludedRow = {
  id: number;
  name: string;
  ticker: string;
  currency: string;
  reason: 'no_price' | 'no_fx_rate';
};

export type ExposureBucketRow = {
  key: string;
  label: string;
  value: number;
  /** Percent of the invested total. */
  share: number;
};

export type ExposureAssetClassRow = ExposureBucketRow & {
  key: AssetClassKey;
  group: MixGroup | null;
  holdingCount: number;
};

export type ExposureGroupRow = ExposureBucketRow & {
  key: MixGroup;
  reference: { min: number; max: number; status: 'below' | 'within' | 'above' } | null;
};

export type ExposureSectorRow = ExposureBucketRow & { generic: boolean };

export type ExposureNoticeId = 'single_holding' | 'top_three' | 'sector' | 'currency';

export type ExposureNotice = {
  id: ExposureNoticeId;
  title: string;
  message: string;
  measured: number;
  threshold: number;
};

export type ExposureRiskSummary = {
  average: number;
  roundedClass: number;
  band: string;
  /** Percent of the invested total that has a risk class. */
  coverage: number;
  holdingsWithoutRiskClass: number;
};

export type ExposureView = {
  status: 'empty' | 'unvaluable' | 'ready';
  baseCurrency: string;
  totalValue: number;
  holdings: ExposureHoldingRow[];
  excluded: ExposureExcludedRow[];
  assetClasses: ExposureAssetClassRow[];
  groups: ExposureGroupRow[];
  unclassified: { value: number; share: number; holdingCount: number };
  currencies: ExposureBucketRow[];
  sectors: ExposureSectorRow[];
  effectiveHoldings: number | null;
  risk: ExposureRiskSummary | null;
  referenceMix: { id: ReferenceMixId; name: string } | null;
  statement: string | null;
  referenceStatement: string | null;
  notices: ExposureNotice[];
  warnings: ExposureWarning[];
};

/** The sentence that names the largest group. Descriptive only. */
const GROUP_SUBJECTS: Record<MixGroup | typeof UNCLASSIFIED, string> = {
  stocks: 'Stocks are',
  bonds: 'Bonds are',
  cash: 'Cash is',
  other: 'Other assets are',
  unclassified: 'Unclassified holdings are',
};

const NOTICE_ORDER: readonly ExposureNoticeId[] = [
  'single_holding',
  'top_three',
  'sector',
  'currency',
];
const DEFAULT_SINGLE_HOLDING_THRESHOLD = 10;
const SHARE_DECIMALS = 10;

/** "14%", "14.3%": a share with one decimal only when it has one. */
export function formatShare(value: number): string {
  const rounded = Math.round(value * SHARE_DECIMALS) / SHARE_DECIMALS;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

type Lookup = (id: string) => Fact | undefined;

function numberOf(fact: Fact | undefined): number {
  return typeof fact?.value === 'number' ? fact.value : 0;
}

function holdingRows(facts: ExposureFacts): ExposureHoldingRow[] {
  const weight = new Map(
    facts.facts
      .filter((fact) => fact.id.startsWith('exposure.holding.') && fact.id.endsWith('.weight'))
      .map((fact) => [Number(fact.context.holdingId), numberOf(fact)]),
  );
  return facts.inputs.holdings.flatMap((holding) =>
    holding.status === 'valued' && holding.valueEur !== null && holding.nativeValue !== null
      ? [
          {
            id: holding.id,
            name: holding.name,
            ticker: holding.ticker,
            currency: holding.currency,
            sector: holding.sector,
            itemType: holding.itemType,
            assetClass: holding.assetClass,
            riskClass: holding.riskClass,
            riskSource: holding.riskSource,
            unitPrice: holding.unitPrice ?? 0,
            priceSource: holding.priceSource,
            priceStale: holding.priceStale,
            nativeValue: holding.nativeValue,
            valueEur: holding.valueEur,
            weight: weight.get(holding.id) ?? 0,
          },
        ]
      : [],
  );
}

function excludedRows(facts: ExposureFacts): ExposureExcludedRow[] {
  return facts.inputs.holdings.flatMap((holding) =>
    holding.status === 'excluded' && holding.excludedReason
      ? [
          {
            id: holding.id,
            name: holding.name,
            ticker: holding.ticker,
            currency: holding.currency,
            reason: holding.excludedReason,
          },
        ]
      : [],
  );
}

function bucketRows(
  facts: ExposureFacts,
  prefix: string,
  labelOf: (fact: Fact) => string,
): ExposureSectorRow[] {
  const values = facts.facts.filter(
    (f) => f.id.startsWith(`${prefix}.`) && f.id.endsWith('.value'),
  );
  return values
    .map((fact) => {
      const stem = fact.id.slice(0, -'.value'.length);
      const share = facts.facts.find((f) => f.id === `${stem}.share`);
      return {
        key: stem.slice(prefix.length + 1),
        label: labelOf(fact),
        value: numberOf(fact),
        share: numberOf(share),
        generic: fact.context.generic === true,
      };
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

function assetClassRows(facts: ExposureFacts): ExposureAssetClassRow[] {
  return bucketRows(facts, 'exposure.asset_class', (fact) => String(fact.context.assetClass)).map(
    (row) => {
      const key = row.key as AssetClassKey;
      return {
        key,
        label: ASSET_CLASS_LABELS[key],
        value: row.value,
        share: row.share,
        group: key === UNCLASSIFIED ? null : ASSET_CLASS_GROUP[key],
        holdingCount: facts.inputs.holdings.filter(
          (h) => h.status === 'valued' && (h.assetClass ?? UNCLASSIFIED) === key,
        ).length,
      };
    },
  );
}

function groupRows(facts: ExposureFacts, find: Lookup): ExposureGroupRow[] {
  const classes = assetClassRows(facts);
  return MIX_GROUPS.map((group) => {
    const range = find(`exposure.reference_mix.${group}`);
    const status = range?.context.status;
    return {
      key: group,
      label: MIX_GROUP_LABELS[group],
      value: classes.filter((c) => c.group === group).reduce((sum, c) => sum + c.value, 0),
      share: numberOf(find(`exposure.group.${group}.share`)),
      reference: range
        ? {
            min: Number(range.context.min),
            max: Number(range.context.max),
            status: status as 'below' | 'within' | 'above',
          }
        : null,
    };
  });
}

function riskSummary(find: Lookup): ExposureRiskSummary | null {
  const average = find('exposure.risk.weighted_average');
  if (!average || typeof average.value !== 'number') return null;
  return {
    average: average.value,
    roundedClass: Number(average.context.roundedClass),
    band: String(average.context.band ?? riskBandLabel(average.value)),
    coverage: numberOf(find('exposure.risk.coverage')),
    holdingsWithoutRiskClass: Number(average.context.holdingsWithoutRiskClass ?? 0),
  };
}

function statementFor(groups: ExposureGroupRow[], unclassifiedShare: number): string | null {
  const candidates: { subject: string; share: number }[] = [
    ...groups.map((g) => ({ subject: GROUP_SUBJECTS[g.key], share: g.share })),
    { subject: GROUP_SUBJECTS[UNCLASSIFIED], share: unclassifiedShare },
  ];
  const largest = candidates.reduce((best, c) => (c.share > best.share ? c : best));
  return largest.share > 0
    ? `${largest.subject} ${formatShare(largest.share)} of your investments`
    : null;
}

function referenceStatementFor(
  groups: ExposureGroupRow[],
  mix: ReferenceMixId | null,
): string | null {
  if (mix === null) return null;
  const outside = groups.filter((g) => g.reference && g.reference.status !== 'within');
  const name = referenceMixName(mix);
  if (outside.length === 0) return `Every group is within the ranges of ${name}.`;
  const parts = outside.map((g) => {
    const range = g.reference!;
    const side = range.status === 'above' ? 'above' : 'below';
    return `${MIX_GROUP_LABELS[g.key].toLowerCase()} are ${side} the range of ${range.min} to ${range.max}%`;
  });
  return `Compared with ${name}: ${parts.join(', ')}. Unclassified holdings are not part of any group.`;
}

function noticeMessage(id: ExposureNoticeId, fact: Fact, threshold: number): string {
  const measured = formatShare(numberOf(fact));
  const limit = formatShare(threshold);
  const subject = String(fact.context.subject ?? '');
  if (id === 'single_holding') {
    const basis =
      threshold === DEFAULT_SINGLE_HOLDING_THRESHOLD
        ? `Many sources treat more than ${limit} in one holding as concentrated.`
        : `Your notice threshold for one holding is ${limit}.`;
    return `${subject} holds ${measured} of your portfolio. ${basis}`;
  }
  if (id === 'top_three') {
    return `Your three largest holdings make up ${measured} of your portfolio. The notice threshold is ${limit}, an editable assumption.`;
  }
  if (id === 'sector') {
    return `${subject} is ${measured} of your portfolio. The notice threshold for one sector is ${limit}, an editable assumption.`;
  }
  return `${measured} of your portfolio is in ${subject}, outside EUR. The notice threshold for one currency is ${limit}, an editable assumption.`;
}

const NOTICE_TITLES: Record<ExposureNoticeId, string> = {
  single_holding: 'Large share in one holding',
  top_three: 'Large share in three holdings',
  sector: 'Large share in one sector',
  currency: 'Large share in one currency',
};

function noticesFor(find: Lookup): ExposureNotice[] {
  return NOTICE_ORDER.flatMap((id) => {
    const check = find(`exposure.check.${id}`);
    const measure = find(`exposure.concentration.${id}`);
    if (check?.value !== true || !measure) return [];
    const threshold = Number(check.context.threshold);
    return [
      {
        id,
        title: NOTICE_TITLES[id],
        message: noticeMessage(id, measure, threshold),
        measured: numberOf(measure),
        threshold,
      },
    ];
  });
}

const NO_UNCLASSIFIED = { value: 0, share: 0, holdingCount: 0 };

function readyParts(facts: ExposureFacts, find: Lookup) {
  const classes = assetClassRows(facts);
  const groups = groupRows(facts, find);
  const unclassifiedRow = classes.find((row) => row.key === UNCLASSIFIED);
  const mix = (find('exposure.reference_mix.stocks')?.context.mix ?? null) as ReferenceMixId | null;
  return {
    assetClasses: classes,
    groups,
    unclassified: unclassifiedRow
      ? {
          value: unclassifiedRow.value,
          share: unclassifiedRow.share,
          holdingCount: unclassifiedRow.holdingCount,
        }
      : NO_UNCLASSIFIED,
    currencies: bucketRows(facts, 'exposure.currency', (f) => String(f.context.currency)).map(
      ({ generic: _generic, ...row }) => row,
    ),
    sectors: bucketRows(facts, 'exposure.sector', (f) => String(f.context.sector)),
    effectiveHoldings: numberOf(find('exposure.concentration.effective_holdings')),
    risk: riskSummary(find),
    referenceMix: mix ? { id: mix, name: referenceMixName(mix) } : null,
    statement: statementFor(groups, unclassifiedRow?.share ?? 0),
    referenceStatement: referenceStatementFor(groups, mix),
    notices: noticesFor(find),
  };
}

const NOTHING_TO_BREAK_DOWN = {
  assetClasses: [],
  groups: [],
  unclassified: NO_UNCLASSIFIED,
  currencies: [],
  sectors: [],
  effectiveHoldings: null,
  risk: null,
  referenceMix: null,
  statement: null,
  referenceStatement: null,
  notices: [],
};

export function buildExposureView(facts: ExposureFacts): ExposureView {
  const byId = new Map(facts.facts.map((fact) => [fact.id, fact]));
  const find: Lookup = (id) => byId.get(id);
  const holdings = holdingRows(facts);
  const excluded = excludedRows(facts);
  const shared = {
    baseCurrency: facts.baseCurrency,
    totalValue: numberOf(find('exposure.total_value')),
    holdings,
    excluded,
    warnings: facts.warnings,
  };
  if (holdings.length === 0 || shared.totalValue === 0) {
    const status = excluded.length > 0 ? 'unvaluable' : 'empty';
    return { ...shared, ...NOTHING_TO_BREAK_DOWN, status };
  }
  return { ...shared, ...readyParts(facts, find), status: 'ready' };
}

/** The settings in use and where they came from, as the API returns them. */
export type ExposureSettingsState = {
  settings: ExposureSettings;
  /** `default` while the person has not saved their own. */
  source: 'default' | 'custom';
  updatedAt: string | null;
  defaultsVersion: string;
  /** A stored document that no longer validates is ignored in favour of the defaults. */
  storedInvalid: boolean;
};

/** `GET /api/exposure`: the facts, the breakdowns derived from them and the settings behind both. */
export type ExposureReport = {
  facts: ExposureFacts;
  view: ExposureView;
  settings: ExposureSettingsState;
};

/** One holding of `PATCH /api/exposure/classification`. A field left out is not changed. */
export type HoldingClassificationUpdate = {
  id: number;
  assetClass?: AssetClass | null;
  riskClassOverride?: number | null;
};

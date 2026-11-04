import {
  HOUSEHOLD_GROUPS,
  HOUSEHOLD_GROUP_LABELS,
  UNCLASSIFIED,
  type HouseholdGroup,
} from './exposureClasses.js';
import type { ExposureFacts, ExposureFxInput, ExposureWarning, Fact } from './exposureFacts.js';
import { formatShare, type ExposureBucketRow } from './exposureView.js';

/**
 * The render-ready Overview, derived from the facts and nothing else. Every share is a
 * share of the positive positions; a negative position is listed in `negative` and subtracted in
 * `totalValue`.
 */

export type ExposureHouseholdGroupRow = ExposureBucketRow & { key: HouseholdGroup };

/** A position below zero: it is in the total, and in no group, currency or share. */
export type ExposureNegativeRow = {
  kind: 'savings' | 'property';
  id: number;
  name: string;
  currency: string;
  /** The person's part in the row's own currency. */
  nativeValue: number;
  /** EUR, below zero. */
  value: number;
};

export type ExposureHouseholdExcludedRow = {
  kind: 'holding' | 'savings' | 'property';
  id: number;
  name: string;
  currency: string;
  reason: 'no_price' | 'no_fx_rate';
};

export type ExposureHouseholdView = {
  status: 'empty' | 'unvaluable' | 'ready';
  baseCurrency: string;
  /** All counted, negative positions subtracted. */
  totalValue: number;
  /** The positive positions: what every share is a share of. */
  grossValue: number;
  /** The negative positions, zero or below. */
  negativeValue: number;
  brokerageValue: number;
  savingsValue: number;
  /** Property equity with negative equity in it: the dashboard's figure. */
  propertyValue: number;
  counts: { holdings: number; savingsAccounts: number; properties: number };
  groups: ExposureHouseholdGroupRow[];
  unclassified: { value: number; share: number };
  currencies: ExposureBucketRow[];
  negative: ExposureNegativeRow[];
  excluded: ExposureHouseholdExcludedRow[];
  staleRates: ExposureFxInput[];
  statement: string | null;
  warnings: ExposureWarning[];
};

const GROUP_SUBJECTS: Record<HouseholdGroup | typeof UNCLASSIFIED, string> = {
  stocks: 'Stocks are',
  bonds: 'Bonds are',
  cash: 'Cash is',
  property: 'Property is',
  other: 'Other assets are',
  unclassified: 'Unclassified holdings are',
};

function householdPositions(facts: ExposureFacts) {
  const { savingsAccounts, properties } = facts.inputs;
  return [
    ...savingsAccounts.map((row) => ({ ...row, kind: 'savings' as const })),
    ...properties.map((row) => ({ ...row, kind: 'property' as const })),
  ];
}

function negativeRows(facts: ExposureFacts): ExposureNegativeRow[] {
  return householdPositions(facts)
    .flatMap((row) =>
      row.valueEur !== null && row.valueEur < 0
        ? [
            {
              kind: row.kind,
              id: row.id,
              name: row.name,
              currency: row.currency,
              nativeValue: row.nativeValue,
              value: row.valueEur,
            },
          ]
        : [],
    )
    .sort((left, right) => left.value - right.value || left.id - right.id);
}

function excludedRows(facts: ExposureFacts): ExposureHouseholdExcludedRow[] {
  const holdings = facts.inputs.holdings.flatMap((row) =>
    row.excludedReason
      ? [
          {
            kind: 'holding' as const,
            id: row.id,
            name: row.name,
            currency: row.currency,
            reason: row.excludedReason,
          },
        ]
      : [],
  );
  const positions = householdPositions(facts).flatMap((row) =>
    row.excludedReason
      ? [
          {
            kind: row.kind,
            id: row.id,
            name: row.name,
            currency: row.currency,
            reason: row.excludedReason,
          },
        ]
      : [],
  );
  return [...holdings, ...positions];
}

function staleRates(facts: ExposureFacts): ExposureFxInput[] {
  const valued = [...facts.inputs.holdings, ...householdPositions(facts)].filter(
    (row) => row.status === 'valued',
  );
  return facts.inputs.fxRates.filter(
    (rate) => rate.stale && valued.some((row) => row.currency === rate.currency),
  );
}

function statementFor(
  groups: readonly ExposureHouseholdGroupRow[],
  unclassifiedShare: number,
): string | null {
  const candidates = [
    ...groups.map((group) => ({ subject: GROUP_SUBJECTS[group.key], share: group.share })),
    { subject: GROUP_SUBJECTS[UNCLASSIFIED], share: unclassifiedShare },
  ];
  const largest = candidates.reduce((best, c) => (c.share > best.share ? c : best));
  return largest.share > 0
    ? `${largest.subject} ${formatShare(largest.share)} of your assets`
    : null;
}

export function buildExposureHouseholdView(facts: ExposureFacts): ExposureHouseholdView {
  const byId = new Map(facts.facts.map((fact) => [fact.id, fact]));
  const amount = (id: string) => numberOf(byId.get(`exposure.household.${id}`));
  const groups = HOUSEHOLD_GROUPS.map((key) => ({
    key,
    label: HOUSEHOLD_GROUP_LABELS[key],
    value: amount(`group.${key}.value`),
    share: amount(`group.${key}.share`),
  }));
  const unclassified = {
    value: amount('unclassified.value'),
    share: amount('unclassified.share'),
  };
  const grossValue = amount('gross_value');
  const negativeValue = amount('negative_value');
  const excluded = excludedRows(facts);
  const { holdings, savingsAccounts, properties } = facts.inputs;
  const worthless = grossValue === 0 && negativeValue === 0;
  return {
    status: statusOf(worthless, excluded.length),
    baseCurrency: facts.baseCurrency,
    totalValue: amount('total_value'),
    grossValue,
    negativeValue,
    brokerageValue: amount('brokerage.value'),
    savingsValue: amount('savings.value'),
    propertyValue: amount('property.value'),
    counts: {
      holdings: holdings.filter((row) => row.status === 'valued').length,
      savingsAccounts: savingsAccounts.filter((row) => row.status === 'valued').length,
      properties: properties.filter((row) => row.status === 'valued').length,
    },
    groups,
    unclassified,
    currencies: currencyRows(facts),
    negative: negativeRows(facts),
    excluded,
    staleRates: staleRates(facts),
    statement: statementFor(groups, unclassified.share),
    warnings: facts.householdWarnings,
  };
}

function statusOf(worthless: boolean, excluded: number): ExposureHouseholdView['status'] {
  if (!worthless) return 'ready';
  return excluded > 0 ? 'unvaluable' : 'empty';
}

function numberOf(fact: Fact | undefined): number {
  return typeof fact?.value === 'number' ? fact.value : 0;
}

function currencyRows(facts: ExposureFacts): ExposureBucketRow[] {
  const prefix = 'exposure.household.currency.';
  const byId = new Map(facts.facts.map((fact) => [fact.id, fact]));
  return facts.facts
    .filter((fact) => fact.id.startsWith(prefix) && fact.id.endsWith('.value'))
    .map((fact) => {
      const key = String(fact.context.currency);
      return {
        key,
        label: key,
        value: numberOf(fact),
        share: numberOf(byId.get(`${prefix}${key}.share`)),
      };
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}

import { fromCents, toCents } from '../utils/money.js';
import { ASSET_CLASS_GROUP, HOUSEHOLD_GROUPS, type HouseholdGroup } from './exposureClasses.js';
import type {
  ExposureFxInput,
  ExposureHoldingFact,
  ExposureWarning,
  FactDraft,
  FactInput,
  FactWarningCode,
} from './exposureFacts.js';
import { roundPercent } from './exposureMath.js';
import { householdShare } from './household.js';
import { propertyEquity, type PropertyDebtSource } from './properties.js';

/**
 * The facts of the Overview: the holdings, plus the person's share of the household's
 * savings accounts and of its property equity. The positions are worked out as net worth works
 * them out (each row at its household share, converted and rounded to cents once), so the savings
 * and property figures here are the dashboard's. Pensions are not part of it.
 *
 * A position can be below zero: a property worth less than its mortgage, an overdrawn account. A
 * share cannot, so every share is a share of the positive positions (`gross_value`), and the
 * negative ones are kept apart and subtracted in the total.
 */

export type ExposureSavingsInput = {
  id: number;
  name: string;
  bank: string;
  currency: string;
  /** The whole balance in the account's currency, before the household share. */
  balance: number;
  isJoint: boolean;
};

export type ExposurePropertyInput = {
  id: number;
  name: string;
  propertyType: string;
  currency: string;
  /** The whole value in the property's currency, before the household share. */
  currentValue: number;
  isJoint: boolean;
  /** The linked active mortgage the person can read; any other link carries no debt. */
  mortgage: (PropertyDebtSource & { id: number }) | null;
};

export type ExposurePositionBasis = 'balance' | 'value' | 'value_less_mortgage';

type PositionValuation = {
  /** The fraction of the row that counts for this person. */
  share: number;
  status: 'valued' | 'excluded';
  excludedReason: 'no_fx_rate' | null;
  /** The person's part in the row's own currency, unrounded, as `propertyEquity` leaves it. */
  nativeValue: number;
  fxRate: number | null;
  valueEur: number | null;
  /** Where the figure comes from: the row, what it was read from, and the rate's date. */
  provenance: { ref: string; basis: ExposurePositionBasis; fxDate: string | null };
};

export type ExposureSavingsPosition = ExposureSavingsInput & PositionValuation;
export type ExposurePropertyPosition = ExposurePropertyInput & PositionValuation;

type Rates = ReadonlyMap<string, ExposureFxInput>;

type Part = {
  ref: string;
  kind: 'holding' | 'savings' | 'property';
  cents: number;
  currency: string;
  group: HouseholdGroup | null;
  warnings: FactWarningCode[];
};

function valuePosition(
  nativeValue: number,
  currency: string,
  rates: Rates,
  baseCurrency: string,
): Pick<PositionValuation, 'status' | 'excludedReason' | 'fxRate' | 'valueEur'> {
  const rate = currency === baseCurrency ? 1 : rates.get(currency)?.rate;
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    return { status: 'excluded', excludedReason: 'no_fx_rate', fxRate: null, valueEur: null };
  }
  return {
    status: 'valued',
    excludedReason: null,
    fxRate: rate,
    valueEur: fromCents(toCents(nativeValue * rate)) || 0,
  };
}

function fxDate(currency: string, rates: Rates): string | null {
  return rates.get(currency)?.sourceDate ?? null;
}

function savingsPosition(
  account: ExposureSavingsInput,
  rates: Rates,
  baseCurrency: string,
): ExposureSavingsPosition {
  const share = householdShare(account.isJoint);
  const nativeValue = account.balance * share;
  return {
    ...account,
    share,
    nativeValue,
    ...valuePosition(nativeValue, account.currency, rates, baseCurrency),
    provenance: {
      ref: `savings:${account.id}`,
      basis: 'balance',
      fxDate: fxDate(account.currency, rates),
    },
  };
}

function propertyPosition(
  property: ExposurePropertyInput,
  rates: Rates,
  baseCurrency: string,
): ExposurePropertyPosition {
  const nativeValue = propertyEquity(property, property.mortgage);
  return {
    ...property,
    share: householdShare(property.isJoint),
    nativeValue,
    ...valuePosition(nativeValue, property.currency, rates, baseCurrency),
    provenance: {
      ref: `property:${property.id}`,
      basis: property.mortgage === null ? 'value' : 'value_less_mortgage',
      fxDate: fxDate(property.currency, rates),
    },
  };
}

function byValueDescending(
  left: PositionValuation & { id: number },
  right: PositionValuation & { id: number },
): number {
  return toCents(right.valueEur ?? 0) - toCents(left.valueEur ?? 0) || left.id - right.id;
}

function holdingParts(holdings: readonly ExposureHoldingFact[], rates: Rates): Part[] {
  return holdings.flatMap((holding) => {
    if (holding.status !== 'valued' || holding.valueEur === null) return [];
    const warnings: FactWarningCode[] = [];
    if (holding.priceStale) warnings.push('price_stale');
    if (rates.get(holding.currency)?.stale) warnings.push('fx_rate_stale');
    if (holding.assetClass === null) warnings.push('unclassified');
    return [
      {
        ref: `holding:${holding.id}`,
        kind: 'holding' as const,
        cents: toCents(holding.valueEur),
        currency: holding.currency,
        group: holding.assetClass === null ? null : ASSET_CLASS_GROUP[holding.assetClass],
        warnings,
      },
    ];
  });
}

function positionParts(
  positions: readonly (PositionValuation & { currency: string })[],
  kind: 'savings' | 'property',
  rates: Rates,
): Part[] {
  return positions.flatMap((position) =>
    position.valueEur === null
      ? []
      : [
          {
            ref: position.provenance.ref,
            kind,
            cents: toCents(position.valueEur),
            currency: position.currency,
            group: kind === 'savings' ? ('cash' as const) : ('property' as const),
            warnings: rates.get(position.currency)?.stale ? ['fx_rate_stale' as const] : [],
          },
        ],
  );
}

function sumCents(parts: readonly Part[]): number {
  return parts.reduce((sum, part) => sum + part.cents, 0);
}

function partInputs(parts: readonly Part[], rates: Rates): FactInput[] {
  const values = parts.map((part) => ({
    ref: part.ref,
    value: fromCents(part.cents),
    unit: 'EUR' as const,
  }));
  const currencies = [...new Set(parts.map((part) => part.currency))].sort();
  return [
    ...values,
    ...currencies.flatMap((currency) => {
      const rate = rates.get(currency);
      return rate
        ? [
            {
              ref: `fx:${currency}`,
              value: rate.rate,
              unit: 'rate' as const,
              date: rate.sourceDate,
            },
          ]
        : [];
    }),
  ];
}

function partWarnings(parts: readonly Part[]): FactWarningCode[] {
  return [...new Set(parts.flatMap((part) => part.warnings))].sort();
}

function amountDraft(id: string, parts: readonly Part[], rates: Rates): FactDraft {
  return {
    id,
    kind: 'amount',
    value: fromCents(sumCents(parts)),
    unit: 'EUR',
    methodId: 'sum_cents',
    inputs: partInputs(parts, rates),
    warnings: partWarnings(parts),
  };
}

// A bucket of positive positions: its amount, and its share of all of them.
function bucketDrafts(
  prefix: string,
  parts: readonly Part[],
  grossCents: number,
  rates: Rates,
  context: FactDraft['context'],
): FactDraft[] {
  const cents = sumCents(parts);
  return [
    { ...amountDraft(`${prefix}.value`, parts, rates), context },
    {
      id: `${prefix}.share`,
      kind: 'share',
      value: grossCents > 0 ? roundPercent(cents, grossCents) : 0,
      unit: 'percent',
      methodId: 'share_of_total',
      inputs: [
        { ref: 'fact:exposure.household.gross_value', value: fromCents(grossCents), unit: 'EUR' },
      ],
      context,
      warnings: partWarnings(parts),
    },
  ];
}

function totalDrafts(parts: readonly Part[], rates: Rates): FactDraft[] {
  const ofKind = (kind: Part['kind']) => parts.filter((part) => part.kind === kind);
  return [
    { ...amountDraft('exposure.household.total_value', parts, rates), kind: 'total' },
    amountDraft(
      'exposure.household.gross_value',
      parts.filter((part) => part.cents > 0),
      rates,
    ),
    amountDraft(
      'exposure.household.negative_value',
      parts.filter((part) => part.cents < 0),
      rates,
    ),
    amountDraft('exposure.household.brokerage.value', ofKind('holding'), rates),
    amountDraft('exposure.household.savings.value', ofKind('savings'), rates),
    amountDraft('exposure.household.property.value', ofKind('property'), rates),
  ];
}

function breakdownDrafts(positive: readonly Part[], rates: Rates): FactDraft[] {
  const grossCents = sumCents(positive);
  const groups = HOUSEHOLD_GROUPS.flatMap((group) =>
    bucketDrafts(
      `exposure.household.group.${group}`,
      positive.filter((part) => part.group === group),
      grossCents,
      rates,
      { group },
    ),
  );
  const unclassified = bucketDrafts(
    'exposure.household.unclassified',
    positive.filter((part) => part.group === null),
    grossCents,
    rates,
    {},
  );
  const currencies = [...new Set(positive.map((part) => part.currency))].flatMap((currency) =>
    bucketDrafts(
      `exposure.household.currency.${currency}`,
      positive.filter((part) => part.currency === currency),
      grossCents,
      rates,
      { currency },
    ),
  );
  return [...groups, ...unclassified, ...currencies];
}

function householdWarnings(
  positions: readonly (PositionValuation & { currency: string })[],
  parts: readonly Part[],
  rates: Rates,
): ExposureWarning[] {
  const missing = positions
    .filter((position) => position.excludedReason === 'no_fx_rate')
    .map((position) => position.currency);
  const stale = positions
    .filter((position) => position.status === 'valued' && rates.get(position.currency)?.stale)
    .map((position) => position.currency);
  const warnings: ExposureWarning[] = [
    ...[...new Set(missing)]
      .sort()
      .map((code) => ({ code: 'fx_rate_missing' as const, subject: `fx:${code}` })),
    ...[...new Set(stale)]
      .sort()
      .map((code) => ({ code: 'fx_rate_stale' as const, subject: `fx:${code}` })),
  ];
  if (parts.every((part) => part.cents === 0)) {
    warnings.push({ code: 'nothing_to_value', subject: 'household' });
  }
  return warnings;
}

/**
 * Values the savings accounts and properties, and works out the facts of the Overview over
 * them and the valued holdings. A position with no stored exchange rate is kept as excluded and
 * named in the warnings, never converted at 1:1.
 */
export function computeHouseholdFacts(input: {
  holdings: readonly ExposureHoldingFact[];
  savingsAccounts: readonly ExposureSavingsInput[];
  properties: readonly ExposurePropertyInput[];
  rates: Rates;
  baseCurrency: string;
}) {
  const { rates, baseCurrency } = input;
  const savingsAccounts = input.savingsAccounts
    .map((account) => savingsPosition(account, rates, baseCurrency))
    .sort(byValueDescending);
  const properties = input.properties
    .map((property) => propertyPosition(property, rates, baseCurrency))
    .sort(byValueDescending);
  const parts = [
    ...holdingParts(input.holdings, rates),
    ...positionParts(savingsAccounts, 'savings', rates),
    ...positionParts(properties, 'property', rates),
  ];
  return {
    savingsAccounts,
    properties,
    drafts:
      parts.length === 0
        ? []
        : [
            ...totalDrafts(parts, rates),
            ...breakdownDrafts(
              parts.filter((part) => part.cents > 0),
              rates,
            ),
          ],
    warnings: householdWarnings([...savingsAccounts, ...properties], parts, rates),
  };
}

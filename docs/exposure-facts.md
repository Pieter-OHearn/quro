# Exposure and its facts

The Exposure tab of the Plan page describes how the brokerage holdings of one person are spread:
by asset class, currency, sector and holding, with a weighted average risk class and notices where
the mix is concentrated. It describes a mix. It never recommends buying, selling or holding
anything, and it does not read the person's goals or circumstances.

Everything on the page comes from one deterministic calculation that returns **facts**. A fact has
an id, a value, the inputs it used, the method that produced it and the settings it read, so a chart,
a table or a later explanation reads the same numbers and can say where each came from. Nothing in
this calculation calls a model or a service, and nothing leaves the instance.

- Calculation: `packages/shared/src/domain/exposureFacts.ts` (`computeExposureFacts`). Pure: the same
  input gives the same output, and it reads no clock, database or network.
- Breakdowns: `packages/shared/src/domain/exposureView.ts` (`buildExposureView`). Derived from the
  facts document only, so the charts and tables cannot disagree with it.
- Settings and defaults: `packages/shared/src/domain/exposureSettings.ts`. Asset classes and the
  suggestion rules: `exposureClasses.ts`.
- Loading and routes: `packages/backend/src/lib/exposure.ts`, `packages/backend/src/routes/exposure.ts`.

## What counts

- Brokerage holdings only, open (not archived) and with shares held. A closed position is not part
  of the portfolio. Pensions, savings and property are not included.
- Holdings are private to their owner. A holding has no joint flag, so an accepted partner's
  holdings never appear in a person's exposure, and theirs never appear in the partner's.
- A holding is worth its shares times the price in use, rounded to cents (`holdingValue`). The price
  in use is the manual price when one is set, otherwise the synced price. The value is converted to
  EUR with the stored exchange rate and rounded to cents once; totals are sums of cents (`sumMoney`
  rules). Aggregation is always in EUR on the backend; the web app converts a EUR figure once, to
  the display currency. Native values are shown beside converted ones.
- A holding with no usable price (missing, zero or negative) or no stored exchange rate for its
  currency is **excluded**, listed in the facts as `excluded` with its reason, and named in the
  warnings. A missing rate is never replaced by 1:1.
- A synced price older than seven days (`isHoldingPriceStale`) and an exchange rate older than 48
  hours are reported as stale and stay in use.
- A holding without an asset class is in the `unclassified` bucket. It counts in the total, the
  sector and the currency breakdowns, and in no group. It counts in the risk average only if it has
  a risk class of its own.

## Endpoints

| Route                                 | Purpose                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/exposure`                   | `{ facts, view, settings }`: the facts document, the breakdowns derived from it, and the settings in use                     |
| `PUT /api/exposure/settings`          | Saves a settings document after validating it. `400` with the first problem in `error` when it is invalid; nothing is stored |
| `DELETE /api/exposure/settings`       | Resets to the defaults by removing the saved document                                                                        |
| `PATCH /api/exposure/classification`  | `{ updates: [{ id, assetClass?, riskClassOverride? }] }`: classify several holdings. All or none; a foreign id answers `404` |
| `PATCH /api/investments/holdings/:id` | `assetClass` (one of the classes, or `null`) and `riskClassOverride` (1 to 7, or `null`) are ordinary holding fields         |

A failed load is a failed request: the page shows an error with a retry, never an empty breakdown.

## Storage

- `holdings.asset_class` (text, nullable; a check constraint lists the eleven classes, so adding a class needs a migration) and
  `holdings.risk_class_override` (integer, nullable, 1 to 7). Both are set by the person; the
  suggestion from the name, sector and item type (`suggestAssetClass`) is only ever shown, never
  saved.
- `exposure_settings`: one row per user (`user_id` unique, deleted with the user), a `settings`
  jsonb document and `updated_at`. A table rather than a column on `users` keeps the document, its
  versioning and its export and deletion in one place. No row means the shipped defaults apply, so a
  release that revises a default reaches everyone who has not customised it. An unreadable stored
  document is ignored in favour of the defaults and reported (`settings.storedInvalid`).
- Both are in the account export and deletion registry (`exposure_settings`; the holding columns
  travel with `holdings`).

## Settings document (version 1)

```jsonc
{
  "version": 1,
  "riskByAssetClass": { "equity_developed": 4, "...": "...", "other": null }, // 1 to 7, or null
  "referenceMixes": {
    "A": { "stocks": { "min": 20, "max": 40 }, "bonds": {}, "cash": {}, "other": {} },
    "B": {},
    "C": {},
    "D": {},
  },
  "selectedMix": null, // "A" to "D", or null for none
  "thresholds": { "singleHoldingPct": 10, "topThreePct": 40, "sectorPct": 30, "currencyPct": 50 },
}
```

Validation (`parseExposureSettings`): percentages are numbers from 0 to 100 (stored to two
decimals), each range has `min` at most `max`, the minimums of a mix add up to at most 100 and its
maximums to at least 100, risk classes are whole numbers from 1 to 7 or `null`, each notice switch is a boolean, the version equals
the current one, and unknown keys are refused. The four mixes are named Reference mix A to D and are
not tied to a risk tolerance. No mix is selected by default.

The notice for one currency other than EUR is **off by default**: a person based in euros who holds
a global fund is mostly exposed to other currencies, so it would fire for almost everyone. Its
threshold stays editable and the breakdown by currency is always shown. A notice that is switched
off is not raised, and its check fact says so (`context.enabled` is `false`).

Every default has a source and a version date in `EXPOSURE_DEFAULT_SOURCES`, shown on the page under
**How this is worked out**. The defaults (`EXPOSURE_DEFAULTS_VERSION`) are reviewed once a year. The
reference mixes are published examples from fund providers; the risk scale is the EU 1 to 7 summary
risk indicator; the mapping from an asset class to a class, and the concentration thresholds, are our
assumptions and say so.

## Facts document

```jsonc
{
  "schema": "quro.exposure.facts",
  "schemaVersion": 1,
  "method": { "id": "exposure-breakdown", "version": "1.0.0" },
  "asOf": "2026-10-09",
  "baseCurrency": "EUR",
  "settings": { "version": 1, "source": "default", "defaultsVersion": "2026-10-18" },
  "inputs": {
    "holdings": [/* one entry per open holding, valued or excluded */],
    "fxRates": [/* the stored rates of the currencies the holdings use */],
  },
  "facts": [/* see below */],
  "warnings": [{ "code": "fx_rate_missing", "subject": "fx:CHF" }],
}
```

An `inputs.holdings` entry has `id`, `name`, `ticker`, `currency`, `sector`, `itemType`, `assetClass`,
`riskClassOverride`, `shares`, `unitPrice`, `priceSource` (`synced` or `manual`), `priceUpdatedAt`,
`priceStale`, and the results of valuing it: `status` (`valued` or `excluded`), `excludedReason`
(`no_price` or `no_fx_rate`), `nativeValue`, `fxRate`, `valueEur`, `riskClass` and `riskSource`
(`override` or `default`). An `inputs.fxRates` entry has `currency`, `rate` (EUR per unit),
`sourceDate`, `updatedAt` and `stale`.

A **fact** is:

| Field             | Meaning                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`              | Stable: the same question about the same data has the same id                                                           |
| `kind`            | `total`, `amount`, `share`, `weight`, `concentration`, `check`, `risk` or `reference_range`                             |
| `value`           | A number, a boolean (`check`) or `null`                                                                                 |
| `unit`            | `EUR`, `percent`, `count`, `index`, `risk_class` or `flag`                                                              |
| `inputs`          | The values it used: `{ ref, value, unit, date? }`, with `ref` such as `holding:12`, `fx:USD`, `fact:...`, `setting:...` |
| `method`          | `{ id, version }` of the rule that produced it                                                                          |
| `settingsVersion` | The version of the settings document it read                                                                            |
| `context`         | Labels and limits the value is read with: a sector's name, a threshold, a range                                         |
| `warnings`        | `price_stale`, `fx_rate_stale`, `unclassified`, `holdings_without_risk_class`                                           |

Fact ids and their methods:

| Id                                                                            | Method                         | Value                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `exposure.total_value`                                                        | `sum_cents`                    | Total of the valued holdings, EUR                                                                                                   |
| `exposure.holding.<id>.weight`                                                | `share_of_total`               | A holding's share of the total, percent                                                                                             |
| `exposure.asset_class.<class>.value` / `.share`                               | `sum_cents`, `share_of_total`  | Per asset class, including `unclassified`                                                                                           |
| `exposure.group.<stocks\|bonds\|cash\|other>.share`                           | `share_of_total`               | Per reference-mix group; unclassified is in none                                                                                    |
| `exposure.currency.<code>.value` / `.share`                                   | as above                       | Per pricing currency                                                                                                                |
| `exposure.sector.<key>.value` / `.share`                                      | as above                       | Per sector (`context.sector` is the label, `context.generic` a broad label)                                                         |
| `exposure.concentration.hhi`                                                  | `hhi`                          | Sum of squared weights, with weights in percent (0 to 10,000)                                                                       |
| `exposure.concentration.effective_holdings`                                   | `effective_number_of_holdings` | 1 divided by the sum of squared weights as fractions (10,000 / HHI)                                                                 |
| `exposure.concentration.single_holding` / `top_three` / `sector` / `currency` | `largest_share`                | The largest share of each kind, percent. Currency ignores EUR; sector ignores broad labels such as Diversified                      |
| `exposure.check.single_holding` / `top_three` / `sector` / `currency`         | `threshold_check`              | `true` when the notice is on and the measure is above the threshold; `context` has `measured`, `threshold`, `enabled`, `applicable` |
| `exposure.risk.weighted_average`                                              | `weighted_average_risk`        | Sum of risk class times value over the value of rated holdings                                                                      |
| `exposure.risk.coverage`                                                      | `share_of_total`               | Share of the total that has a risk class                                                                                            |
| `exposure.reference_mix.<group>`                                              | `reference_range_check`        | Only with a selected mix: the group's share, `context` has `mix`, `min`, `max`, `status`                                            |

Notices other than the single-holding one apply only to a portfolio large enough to be spread (the
top-three check needs four holdings, the sector and currency checks two); `context.applicable` says
when a check did not apply.

## Warnings

`fx_rate_missing` (subject `fx:<code>`), `price_missing` (`holding:<id>`), `fx_rate_stale`,
`price_stale`, `unclassified_holdings` and `nothing_to_value` (`portfolio`). Excluded holdings are
never in a total, share or average.

## Versioning

`schemaVersion` changes when the shape of the facts document changes. `method.version` changes when
a calculation changes its result for the same input. The settings document has its own `version`.
A fact never changes meaning under the same id; a changed rule gets a new method version and a note
here. A later explanation, of any kind, must read this document and cite fact ids and their inputs
rather than recompute a figure.

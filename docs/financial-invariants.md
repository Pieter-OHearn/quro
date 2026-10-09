# Financial invariants

This page states how Quro does money arithmetic and which properties every financial
calculation keeps. Tests enforce each invariant; [where the tests live](#where-the-tests-live)
lists them. [Household totals and currency policy](household-model.md) covers partner links and
the dashboard contract, and [wealth planning](wealth-planning.md) covers the runway model.

## Arithmetic policy

Decided on 2026-10-09:

- Money stays PostgreSQL `numeric` at rest (exact decimal, `numeric(19,2)` today) and plain
  numbers on the wire. It is not migrated to integer columns.
- Money arithmetic in code goes through integer cents with `toCents` and `fromCents`, rounding
  half away from zero once, at the [rounding points](#rounding-points) below. No float sum of
  money is kept without that rounding.
- Money in a request is rounded to cents when it is parsed, and an amount of 10^13 or more is
  refused ([money input](#money-input)).
- Unit prices, share quantities, FX rates and percentages are not money and keep their decimal
  precision. Prices per share are stored with two decimals today; widening them to six decimals
  is a separate change.
- A money scale wider than two decimals, for a three-decimal currency, would be an additive
  migration if it is ever needed.

How values move:

- **Storage.** Each column has a fixed scale (see the [precision table](#precision)). PostgreSQL
  rounds a written value to that scale, half away from zero, like `toCents`.
- **Reading.** The schema's `numericAsNumber` type turns the driver's decimal string into a
  number and refuses `NaN` and infinities (`packages/backend/src/db/driverNumeric.ts`). It never
  replaces a bad value with 0.
- **Writing.** A number is sent as its shortest decimal text, and balance updates such as
  `balance + delta` run in exact `numeric`.
- **JSON.** API responses carry numbers, keep `null` as `null`, and keep each row's native
  currency next to its amounts.

### Rounding points

Money is rounded to cents, half away from zero, at these points and nowhere else:

- When a request is parsed ([money input](#money-input)).
- When a budget amount is converted to EUR on write.
- When a repayment's principal is derived as `amount - interest`.
- In the clamped balance helpers in `packages/backend/src/lib/balance.ts`.
- When an aggregate (net worth, snapshot, runway) is stored or shown. These aggregates still sum
  numbers and round once at the end; moving them onto integer cents is part of consolidating the
  domain maths in `@quro/shared`.

### Money input

Request money is parsed by `parseMoneyField` and `parseOptionalMoneyField` in
`packages/backend/src/lib/requestValidation.ts`. They round the amount to cents half away from
zero, apply the field's minimum after rounding (so `0.004` is not "greater than zero"), and
refuse an absolute value of 10^13 or more with a 400 that names the field.

| Family           | Money fields                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Savings          | account `balance`, deposit guarantee `cap`, transaction `amount`                                                                                     |
| Budget           | category `budgeted` and `spent`, transaction `amount`                                                                                                |
| Pensions         | pot `balance`, `employeeMonthly`, `employerMonthly`; transaction and import row `amount`, `taxAmount`                                                |
| Properties       | `purchasePrice`, `currentValue`, `mortgage`, `monthlyRent`; transaction `amount`, `interest`, `principal`                                            |
| Mortgages        | `originalAmount`, `outstandingBalance`, `propertyValue`, `monthlyPayment`; transaction `interest`, `principal`, and `amount` except on a rate change |
| Debts            | `originalAmount`, `remainingBalance`, `monthlyPayment`; payment `amount`, `interest`                                                                 |
| Payslips         | `gross`, `tax`, `pension`, `net`, `bonus`                                                                                                            |
| Goals            | `currentAmount`, `targetAmount`, `monthlyContribution`, `monthlyTarget`                                                                              |
| Plan assumptions | `leanBurnOverride`, `benefitMonthlyOverride`, `severanceMonthlySalaryOverride`                                                                       |

Not money, and parsed without the rule: holding `currentPrice`, `manualPrice` and transaction
`price` and `shares`; every interest rate; a mortgage rate change's `amount` (the new rate);
`overpaymentLimit` (a percentage); `emergencyLifestylePct`; durations and counts. bunq payments
are provider data rather than requests and arrive with two decimals.

Two edge cases. A goal with a `unit` may count something other than money, but its amounts are
stored with two decimals either way, so the rule only does what storage already does. A dividend's
amount travels in the holding transaction's `price` field, a unit-price field, so it is not
parsed as money; it is still stored with two decimals.

### Measured envelope

Numbers are exact enough for this policy only within bounds. These were measured and are
asserted by the property tests:

| Property                                                                | Holds for                            |
| ----------------------------------------------------------------------- | ------------------------------------ |
| `toCents` equals exact half-away-from-zero rounding of the decimal text | up to 3 decimals, below 10^12        |
| A 2-decimal value survives text, number, text unchanged                 | below 10^13 (fails from about 10^14) |
| A 6-decimal share or FX rate survives the same round trip               | below 10^9                           |
| `toCents(a + b) = toCents(a) + toCents(b)` for cent amounts             | below 10^12                          |
| A float sum of cent amounts, rounded once, equals the exact cent sum    | 2,000 terms below 10^6 each (tested) |

A float sum drifts by at most about `n × |largest partial sum| × 2^-53`, which is why money is
summed in integer cents. `numeric(19,2)` itself accepts values up to 10^17; the money input
limit keeps every amount inside the 10^13 round-trip bound.

### Options compared

Before the decision, the integer-cents-in-code policy was compared with integer minor units in
storage.

| Concern                    | `numeric` at rest, integer cents in code (decided)                  | Integer minor units in storage                                                          |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Currency precision         | Every supported currency has 2 decimals; a wider scale is additive. | Needs a minor-unit exponent per currency once a 0- or 3-decimal currency is added.      |
| Shares, FX rates, interest | Stored and carried at their own scale (6, 6 and 4 decimals).        | Still fractional; they stay numeric either way, so the codebase keeps two number kinds. |
| FX conversion and shares   | Produce sub-cent values; rounded once at the rounding points.       | Produce the same sub-cent values; a rounding rule is still required at every product.   |
| Exactness of stored values | Exact: `numeric` is the record and does balance updates itself.     | Exact.                                                                                  |
| Exactness in memory        | Exact in integer cents below 2^53 cents.                            | Exact for sums below 2^53 cents (9 × 10^13 units); the same bound.                      |
| JSON and clients           | Plain JSON numbers; the frontend formats them.                      | Every client converts; a breaking API change for every amount.                          |
| Change cost                | No migration; code moves to integer cents.                          | 52 money columns, every route, the frontend, fixtures, backup and restore tests.        |

Storage is already exact; the risk was float arithmetic in JavaScript, which integer cents in
code remove without migrating 52 columns of real data or breaking the API.

**Migration implications.** None. Had integer minor units been chosen, each amount would have
needed a new integer column, an idempotent backfill from `numeric` with a preflight that refuses
values outside `bigint` or with more decimals than the currency allows, a dual-read period, an
API version for the new shape, and the 0.7.0 upgrade fixture to prove nulls, negative equity,
native currencies and provenance survive.

## Precision

| Value                                            | Column type     | Rounded when                                                    |
| ------------------------------------------------ | --------------- | --------------------------------------------------------------- |
| Balances, amounts, payments, snapshot components | `numeric(19,2)` | when parsed; at the rounding points; stored (PostgreSQL)        |
| Holding prices (unit prices)                     | `numeric(19,2)` | stored                                                          |
| Holding shares                                   | `numeric(19,6)` | stored                                                          |
| FX rates to EUR                                  | `numeric(12,6)` | stored; never rounded in conversion                             |
| Interest rates                                   | `numeric(7,4)`  | stored                                                          |
| Import confidence                                | `numeric(5,4)`  | stored                                                          |
| Display                                          | n/a             | `formatCurrency`: 2 decimals unless a view asks for whole units |

Holding prices are stored with 2 decimals, so a quote with more decimals loses them when saved.

## Signs

Amounts on ledger rows are positive; the row type gives the effect.

| Ledger                   | Effect on its balance                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Savings                  | `deposit` and `interest` add, `withdrawal` subtracts; the stored sign is ignored.                                                  |
| Pension                  | `contribution` adds `amount - taxAmount`, `fee` subtracts, `annual_statement` adds its signed amount, any other type does nothing. |
| Mortgage, property, debt | A repayment's principal reduces the outstanding balance, never below zero.                                                         |
| Holdings                 | Shares are buys minus sells, floored at zero per holding; dividends do not move shares.                                            |
| Budget                   | A transaction's EUR amount adds to its category's `spent`.                                                                         |

Liabilities are positive and subtracted from assets. Property equity is value minus debt and may
be negative; Quro keeps negative equity rather than flooring it.

## FX conversion

- Dashboard, snapshot and runway figures are computed in EUR on the backend and converted once
  for display.
- Current figures use the current rate for each currency; history uses the last rate at or before
  each month's cut-off.
- A month before the first stored rate uses the earliest rate and is marked `isEstimated`.
- A missing or invalid rate fails the request (`503`). Quro never assumes 1:1 for a foreign
  currency and never infers an unknown historical rate.
- Budget amounts are converted to EUR once, at the current rate, when written; the native amount
  and currency are kept as `sourceAmount` and `sourceCurrency`.

## Time cut-offs

- Calendar dates are `YYYY-MM-DD` and are validated by
  `packages/backend/src/lib/requestValidation.ts`. A ledger date is treated as UTC midnight.
- A completed month ends at 23:59:59.999 UTC on its last day; the current month's cut-off is now.
  A transaction dated today counts in the current month; one dated later does not count yet.
- A write deletes the stored snapshots from the month of the earliest affected date onward, so
  they are recomputed. Completed months are otherwise not rewritten.
- `todayIsoDate` gives the local calendar date (for forms); `toIsoDate` and `toDateOnly` give UTC
  dates (for the server). Mixing them shifts dates for users east or west of UTC around midnight.
- Rule periods include both `effectiveFrom` and `effectiveTo`.

## Ownership shares

Covered in full by [household totals and currency policy](household-model.md). In short: a user
sees their own rows and an accepted partner's joint rows; joint money counts 50% for each partner,
so the two halves add up to the whole; only explicit money columns are weighted; transactions
inherit jointness from their parent; private partner rows never appear. Only the runway
liquidity assumption can count a joint balance in full.

## Ledger invariants

- **Balance equals its ledger.** A manual savings account, pension pot, mortgage, unlinked
  property debt and debt each keep `balance = opening balance + effect of the rows still in its
ledger`. A budget category keeps `spent = opening spent + its transactions`.
- **Edits and deletes are reversible.** An edit reverses the old row's effect and applies the new
  one; a delete reverses it. Editing a row and editing it back, or creating a row and deleting it,
  leaves the balance as it was.
- **Moves conserve.** Moving a transaction to another account or pot removes its effect from the
  old parent and adds it to the new one.
- **Concurrent writes serialise.** An edit or delete locks the ledger row before reversing it, so a
  second edit or delete of the same row waits for the first and works from its result. Savings,
  mortgage and property rows are reached through their parent, so one that moved to another
  parent in the meantime is refused with `409`; budget, pension and debt rows are reached through
  their owner and need no such check.
- **Imports apply once.** bunq payments are keyed by `(user, bunqTransactionId)`; a repeated
  import adds nothing. A reviewed pension statement is claimed by its commit, so a second commit
  of the same import is refused and its rows reach the ledger once.
- **Linked debt is read, not copied.** A property linked to an active mortgage takes its debt from
  the mortgage; an archived or missing linked mortgage contributes no debt. Mortgage debt is
  deducted inside property equity and never counted again as a liability.
- **Totals reconcile.** For each partner, the dashboard allocations, the totals a client derives
  from the list endpoints with the documented share and FX rules, and the same aggregate computed
  in SQL agree to the cent. A stored snapshot's total matches the live figure; its separately
  rounded components add up to it within one cent each.

### Known exceptions

These are recorded, not yet fixed:

- **Clamp at zero.** A repayment whose principal exceeds the balance by up to one cent is accepted
  and leaves the balance at zero. Deleting it restores the full principal, so the balance ends one
  cent above where it started.
- **Provider balances.** A bunq-synced savings account takes its balance from bunq; its imported
  transactions are a record and do not move the balance.

## Source, as-of, estimated and missing data

Every derived figure says where its inputs came from and whether any input is a fallback.

| Indicator | Meaning                                                       | Exposed today                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source    | Who supplied a value                                          | FX `provider`; holding `manualPrice` and `excludeFromSync`; budget `sourceProvider`, `sourceAmount`, `sourceCurrency`; runway `taxRateSource`, `salaryBasis.status`, `durationSource`, `burnSource`; rule `sources` |
| As-of     | When a value was true                                         | FX `sourceDate` and `updatedAt`; holding `priceUpdatedAt`; runway `asOf` and `jurisdiction.rulesEffectiveFrom`; history points by month; rule `effectiveFrom`, `effectiveTo`, `reviewedAt`                          |
| Estimated | A fallback, unreviewed, stale or unknown input fed the figure | `isEstimated` on history points and the runway; `isExtrapolated` on rules and the runway jurisdiction; budget `currencyNeedsReview`                                                                                 |
| Missing   | An input is absent                                            | Missing FX fails with `503`; runway `employment.missingFields`, `setupComplete`, `salaryBasis.status = "missing"`, component `status = "unknown"`; deposit guarantee `confidence = "unverified"`                    |

Rules for every figure:

- **Estimated is inclusive.** The runway is `isEstimated` when budget currencies need review, the
  salary basis is a fallback, unemployment support is unknown, or a jurisdiction rule is
  extrapolated. A history point is estimated when a rate or price precedes the stored history.
- **Missing data is never a smaller total.** A failed read fails the request; the dashboard never
  replaces an unreadable asset class with an empty list.
- **Stale rules are never current.** A rule used outside its published period is
  `isExtrapolated`. An open-ended rule with a source (`effectiveTo: null`) is current only for
  twelve months after its `reviewedAt` date (the rule review interval, `RULE_REVIEW_INTERVAL_MONTHS` in
  `packages/shared/src/types/jurisdiction.ts`); after that it resolves as extrapolated until
  someone reviews it. Rules without a source, such as the default tax rate, are model
  assumptions and are labelled as defaults instead.

The frontend already treats an FX rate as stale 48 hours after `updatedAt`, but no view shows
that yet. Showing these indicators consistently in the interface is design work that follows this
contract.

## Rule review and corrections

The repository maintainer (the default code owner in `.github/CODEOWNERS`) owns the
jurisdiction rules in `packages/backend/src/lib/jurisdictions/` and the calculations on this page.

- **When.** Before every release, and when a publisher's period starts: the Dutch UWV maximum
  daily wage changes on 1 January and 1 July, Dutch tax and Box 3 figures on 1 January, and
  Australian figures on 1 July. An open-ended rule falls back to extrapolated twelve months after
  its last review (the rule review interval), which forces a review at least once a year.
- **How.** Check each value against its source link, then update `reviewedAt` on every source
  that was checked, even when nothing changed. A new published value is a new effective-dated
  entry; an earlier period is not edited.
- **Correcting a wrong value or calculation.** Anyone can report one through a GitHub issue with
  synthetic figures. The fix starts with a test that reproduces the error, changes the rule entry
  or calculation, and states the correction in the release notes, including which figures move.
  A wrong value in a past period is corrected in place with its source. Completed monthly
  snapshots are not rewritten; they record what Quro showed at the time.

## Cross-view divergences (baseline for consolidation)

The frontend and backend still compute some figures separately. These differences were recorded
on 2026-10-09 so the consolidation into `@quro/shared` (planned) can prove each
correction. Inputs and outputs below were run against both implementations.

| Topic                      | Backend                                                                                                                 | Frontend                                                                                                                  | Example                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Holding position           | Net buys minus sells, floored at zero at the end (`lib/netWorth.ts`, `lib/netWorthHistory.ts`)                          | Clamped at zero on every sell (`investments/utils/position.ts`, `utils/portfolio.ts`, `hooks/useInvestmentStatTrends.ts`) | buy 10, sell 15, buy 10: backend 5 shares, frontend 10                                |
| Investment property type   | Lower-cased and trimmed; includes `rental` (`routes/properties.ts`)                                                     | Exact match of four labels (`investments/utils/position.ts`)                                                              | `buy-to-let` and `rental`: backend accepts rent and expense rows, frontend hides them |
| Pension transaction effect | Unknown types do nothing (`lib/pensionTransactions.ts`)                                                                 | Unknown types add their amount (`pension/utils/pension-calculations.ts`)                                                  | a `transfer` of 100: backend 0, frontend +100                                         |
| Pension balance            | Not floored                                                                                                             | Floored at zero for display (`computeCurrentPensionBalance`)                                                              | a pot at -50 shows 0                                                                  |
| Joint share                | `householdShare` (`lib/partner.ts`)                                                                                     | Separate `0.5` constants: `JOINT_PROPERTY_SHARE`, `JOINT_TXN_WEIGHT`                                                      | same value today; three places to change                                              |
| Savings page total         | Dashboard counts joint accounts at 50%                                                                                  | Savings page sums full balances (`savings/utils/savings-data.ts`)                                                         | a 6,000 joint account: dashboard 3,000, savings page 6,000                            |
| Savings history            | Each account floored at zero, UTC months, unrounded                                                                     | Total floored, rounded to whole units, local-calendar months                                                              | months differ around midnight on the first for users outside UTC                      |
| Current month vs dashboard | History floors negative savings and debt balances, leaves out future-dated rows, and prices holdings from price history | Dashboard allocations use current balances and `currentPrice`                                                             | an overdrawn account lowers allocations but not the current history point             |
| FX staleness               | None                                                                                                                    | Stale 48 hours after `updatedAt`                                                                                          | a provider outage is visible only to the frontend                                     |

## Where the tests live

| Invariant                                                 | Tests                                                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Cent rounding, round trips, float sums                    | `packages/shared/test/moneyPolicy.test.ts`, `packages/backend/src/db/driverNumeric.test.ts`                                            |
| Money input: cents, the 10^13 limit, non-money untouched  | `packages/backend/src/lib/requestValidation.test.ts`, `packages/backend/src/routes/moneyInput.integration.test.ts`                     |
| Allocation identities, order, additivity, FX, linked debt | `packages/backend/src/lib/financialInvariants.test.ts`                                                                                 |
| Joint shares, signs, missing data                         | `packages/backend/src/lib/financialInvariants.test.ts`, `packages/backend/src/lib/partner.test.ts`                                     |
| FX cut-offs and fail-closed rates                         | `packages/backend/src/lib/currencyRateCache.test.ts`                                                                                   |
| Ledger balances under random edits, moves and deletes     | `packages/backend/src/routes/ledgerInvariants.integration.test.ts`                                                                     |
| Concurrent edits, deletes and import commits              | `packages/backend/src/routes/ledgerConcurrency.integration.test.ts`                                                                    |
| Golden household reconciliation across API, pages and SQL | `packages/backend/src/routes/householdReconciliation.integration.test.ts`                                                              |
| Repeated bunq imports                                     | `packages/backend/src/routes/budget-currency.integration.test.ts`, `packages/backend/src/services/bunqBudgetBatch.integration.test.ts` |
| Stale and extrapolated rules                              | `packages/backend/src/lib/jurisdictions/jurisdictions.test.ts`, `packages/backend/src/routes/plan.integration.test.ts`                 |

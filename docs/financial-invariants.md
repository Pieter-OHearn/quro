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
  half away from zero once, at the [rounding points](#rounding-points) below. Totals of money are
  summed in cents with `sumMoney`, so no float sum of money is kept.
- Money in a request is rounded to cents when it is parsed, and an amount of 10^13 or more is
  refused ([money input](#money-input)).
- Unit prices, share quantities, FX rates and percentages are not money and keep their decimal
  precision. Prices per share are stored with six decimals ([unit prices](#unit-prices)).
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
- When the expected mortgage repayment is worked out (`expectedMortgageRepayment` in
  `@quro/shared`): interest, principal and amount are each whole cents.
- In the clamped balance helpers in `packages/backend/src/lib/balance.ts`.
- When a holding is valued or a trade is costed: shares × the stored six-decimal price, never a
  price rounded for display (`holdingValue`, and each buy or sell in the position rule below).
- When an amount is added to a total. `sumMoney` rounds each amount (after FX conversion and the
  household share, when they apply) to cents once and adds the cents exactly. Net worth and its
  components, stored snapshots, history points, runway liquidity tiers and burn, and the page
  totals of the savings, investments, pension and debts pages are such totals, so a total always
  equals the sum of the rounded amounts it is made of, and its components add up to it exactly.

A foreign holding is rounded twice: once in its own currency, as its page shows it, and once
when that value is converted for a total.

### Money input

Request money is parsed by `parseMoneyField` and `parseOptionalMoneyField` in
`packages/backend/src/lib/requestValidation.ts`. They round the amount to cents half away from
zero, apply the field's minimum after rounding (so `0.004` is not "greater than zero"), and
refuse an absolute value of 10^13 or more with a 400 that names the field.

| Family           | Money fields                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Savings          | account `balance`, deposit guarantee `cap`, transaction `amount`                                                                    |
| Budget           | category `budgeted` and `spent`, transaction `amount`                                                                               |
| Pensions         | pot `balance`, `employeeMonthly`, `employerMonthly`; transaction and import row `amount`, `taxAmount`                               |
| Properties       | `purchasePrice`, `currentValue`, `monthlyRent`; transaction `amount`                                                                |
| Mortgages        | `originalAmount`, `outstandingBalance`, `monthlyPayment`; transaction `interest`, `principal`, and `amount` except on a rate change |
| Debts            | `originalAmount`, `remainingBalance`, `monthlyPayment`; payment `amount`, `interest`                                                |
| Holdings         | a dividend transaction's `price` (the amount received)                                                                              |
| Payslips         | `gross`, `tax`, `pension`, `net`, `bonus`                                                                                           |
| Goals            | `currentAmount`, `targetAmount`, `monthlyContribution`, `monthlyTarget`                                                             |
| Plan assumptions | `leanBurnOverride`, `benefitMonthlyOverride`, `severanceMonthlySalaryOverride`                                                      |

Not money, and parsed without the rule: holding `currentPrice` and `manualPrice` and a buy or
sell's `price` (unit prices, see below) and `shares`; every interest rate; a mortgage rate
change's `amount` (the new rate); `overpaymentLimit` (a percentage); `emergencyLifestylePct`;
durations and counts. bunq payments are provider data rather than requests and arrive with two
decimals.

Two edge cases. A goal with a `unit` may count something other than money, but its amounts are
stored with two decimals either way, so the rule only does what storage already does. A dividend's
amount travels in the holding transaction's `price` field, a six-decimal unit-price column, so
the rule is applied by transaction type: a dividend's `price` is rounded to cents and refused at
10^13 like any amount, and the column never holds a sub-cent dividend.

### Unit prices

A price per share (holding `currentPrice` and `manualPrice`, a buy or sell's `price`, and the
close prices in the price history) is stored as `numeric(23,6)`: six decimals and the same 17
integer digits as money. `parseUnitPriceField` and `roundUnitPrice` in
`packages/backend/src/lib/requestValidation.ts` round a price to six decimals half away from
zero when it is parsed, working on the number's shortest decimal text, so the result is exactly
what PostgreSQL stores; a minimum such as "greater than zero" is applied after rounding. Quotes
from the price provider are stored with the precision they arrive with, up to six decimals.
Interfaces may show fewer decimals; that rounding is for display only.

### Measured envelope

Numbers are exact enough for this policy only within bounds. These were measured and are
asserted by the property tests:

| Property                                                                | Holds for                            |
| ----------------------------------------------------------------------- | ------------------------------------ |
| `toCents` equals exact half-away-from-zero rounding of the decimal text | up to 3 decimals, below 10^12        |
| A 2-decimal value survives text, number, text unchanged                 | below 10^13 (fails from about 10^14) |
| A 6-decimal share, unit price or FX rate survives the same round trip   | below 10^9                           |
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
API version for the new shape, and an integration test against pre-existing synthetic rows to
prove nulls, negative equity, native currencies and provenance survive.

## Precision

| Value                                            | Column type     | Rounded when                                                    |
| ------------------------------------------------ | --------------- | --------------------------------------------------------------- |
| Balances, amounts, payments, snapshot components | `numeric(19,2)` | when parsed; at the rounding points; stored (PostgreSQL)        |
| Holding prices (unit prices)                     | `numeric(23,6)` | when parsed; stored                                             |
| Holding shares                                   | `numeric(19,6)` | stored                                                          |
| FX rates to EUR                                  | `numeric(12,6)` | stored; never rounded in conversion                             |
| Interest rates                                   | `numeric(7,4)`  | stored                                                          |
| Import confidence                                | `numeric(5,4)`  | stored                                                          |
| Display                                          | n/a             | `formatCurrency`: 2 decimals unless a view asks for whole units |

## Signs

Amounts on ledger rows are positive; the row type gives the effect.

| Ledger         | Effect on its balance                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Savings        | `deposit` and `interest` add, `withdrawal` subtracts; the stored sign is ignored; any other type does nothing.                     |
| Pension        | `contribution` adds `amount - taxAmount`, `fee` subtracts, `annual_statement` adds its signed amount, any other type does nothing. |
| Mortgage, debt | A repayment's principal reduces the outstanding balance, never below zero; the part a zero balance cannot take is recorded.        |
| Property       | The latest valuation dated on or before today sets `currentValue`; rent income and expenses move no balance.                       |
| Holdings       | Shares are buys minus sells, floored at zero per holding; dividends do not move shares (see [positions](#holding-positions)).      |
| Budget         | A transaction's EUR amount adds to its category's `spent`.                                                                         |

The savings and pension rules are `signedSavingsAmount` and `pensionTransactionDelta` in
`@quro/shared`; the server's ledger writes and history and the pages' previews and charts all
use them.

### Holding positions

`computeHoldingPosition` in `packages/shared/src/domain/holdings.ts` is the one position rule;
the dashboard, the net worth history, the runway and the investments page all use it, or
`netHoldingShares` where only shares are needed.

- Shares are counted in whole millionths, so fractional shares sum exactly (0.1 + 0.2 - 0.3
  shares is none, not 5.6 × 10^-17).
- Shares held are buys minus sells, floored at zero, and do not depend on the order of the rows.
- Cost is average cost. The ledger is replayed by date, then id; each buy or sell is costed at
  shares × price rounded to cents. A sell realises the difference between its proceeds and the
  average cost of the shares sold. A sell of more than is held sells what is held; the excess
  has no cost and is netted against later buys, which add cost only for the shares beyond it.
- Dividends add to dividends (in cents) and never move shares. Rows of an unknown type, and buys
  or sells without a positive share count, are ignored.
- A buy at price zero has no cost: the average cost is 0.

Liabilities are positive and subtracted from assets. Property equity is value minus debt and may
be negative; Quro keeps negative equity rather than flooring it.

### Exposure

The Exposure view ([facts](exposure-facts.md)) values a holding as shares times the price in use,
rounded to cents, then converts it to EUR and rounds to cents once, and sums cents. A price entered
by hand is the price in use there, as on the Investments page; the dashboard's brokerage figure
reads the synced price. A holding with no usable price or no stored rate is excluded and reported,
never valued at a guess. Shares of the total are rounded to two decimals once, and the effective
number of holdings is 1 divided by the sum of squared weights.

### Expected mortgage repayment

`suggestMortgageRepayment` in `@quro/shared` gives the repayment a mortgage expects on a date.
The new-repayment form suggests it and the amortisation projection follows it month by month.

- **Interest** is the balance before the payment × the annual rate in effect on that date / 12.
  The rate is the latest rate change dated on or before it, otherwise the mortgage's current
  rate (the rate before the first recorded change is not known).
- **Principal** is the original amount / (term × 12) for a linear loan and the monthly payment
  less the interest for an annuity, never below zero and capped at the balance.
- **Amount** is principal plus interest. Each figure is whole cents.

The form uses the current balance as the balance before the payment, dates the suggestion a
month after the latest repayment (otherwise today), and never guesses a part month or an
overpayment. Every field stays editable, a field the user changed is not overwritten, and an
edited repayment is never re-suggested. A linear mortgage's current payment is this figure for
today's balance rather than the payment stored when the mortgage was created.

## FX conversion

- Dashboard, snapshot and runway figures are computed in EUR on the backend and converted once
  for display.
- Current figures use the current rate for each currency; history uses the last rate at or before
  each point's cut-off (a month end, or a day in the one-month range).
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
  The daily points of the one-month history range end at 23:59:59.999 UTC on their day, today's
  at now.
- The dashboard's "year to date" change measures from the previous year end (31 December,
  23:59:59.999 UTC), or from the first month end of this year for a household whose records start
  this year; a zero or negative starting value has no percentage.
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

The share comes from one function, `householdShare` in `@quro/shared`, which the server's
household scoping, the runway and every page that weights a joint row call. A half share keeps
its sub-cent precision until it is added to a total, where it is rounded once: each partner's
half of an odd-cent amount rounds away from zero (half of 6,000.01 is 3,000.005, shown and
counted as 3,000.01 for each partner).

## Ledger invariants

- **Balance equals its ledger.** A manual savings account, pension pot, mortgage and debt each
  keep `balance = opening balance + effect of the rows still in its ledger`. A budget category
  keeps `spent = opening spent + its transactions`. A property with a valuation in effect keeps
  `currentValue` equal to its latest valuation dated on or before today (ties by id).
- **Each ledger owns its rows.** A property's ledger keeps what happens to the asset: valuations,
  rent income and expenses. A mortgage's keeps what happens to the loan: repayments and rate
  changes. Each API refuses the other's types with `400` on create and edit, and each page shows
  the other's rows read-only with a link to the page that edits them.
- **Valuations set the value.** Creating, editing, moving or deleting a valuation recomputes
  `currentValue` of every property it touched, inside the transaction, after the properties and
  then the row are locked. A property whose last valuation is deleted keeps the value it had;
  while a valuation sets the value, it is changed by recording another one, and a request that
  sets a different value by hand is refused with `400`.
- **Valuations count from their date.** "Today" is the calendar date in UTC, the calendar the net
  worth history uses. A valuation dated later is stored but sets neither `currentValue` nor any
  history point until its date; the daily `net-worth-snapshot` job then applies it, locking the
  property as a valuation write does, before it writes the day's snapshots. Until then the value
  can still be edited by hand.
- **Edits and deletes are reversible.** An edit reverses the old row's effect and applies the new
  one; a delete reverses it. Editing a row and editing it back, or creating a row and deleting it,
  leaves the balance as it was.
- **Clamped repayments reverse exactly.** A repayment whose principal exceeds the balance by up to
  one cent leaves the balance at zero and records the principal it could not apply
  (`unappliedPrincipal`). An edit or delete restores only what was applied, so a debt of 100.00
  with a payment of 100.01 returns to 100.00 when the payment is deleted.
- **Repayments stay with their debt.** A repayment lives in the mortgage's ledger it paid, so
  editing or deleting it reverses the effect on that mortgage whatever the property's link is
  later. A property records no repayment of its own.
- **Moves conserve.** Moving a transaction to another account or pot removes its effect from the
  old parent and adds it to the new one.
- **Concurrent writes serialise.** An edit or delete locks the ledger row before reversing it, so a
  second edit or delete of the same row waits for the first and works from its result. Savings,
  mortgage and property rows are reached through their parent, so one that moved to another
  parent in the meantime is refused with `409`; budget, pension and debt rows are reached through
  their owner, and one that moved is refused with `409` too.
- **Parents are locked before their rows.** Every edit or delete locks the parent rows it may
  change (account, pot, debt, category, or mortgages and then properties) in ascending id order,
  then the ledger row. A cascade archive locks the parent and then deletes its rows, so an archive
  and an edit of one of its rows wait for each other instead of deadlocking; the edit then finds
  the row gone (`404`).
- **Imports apply once.** bunq payments are keyed by `(user, bunqTransactionId)`; a repeated
  import adds nothing. A reviewed pension statement is claimed by its commit, so a second commit
  of the same import is refused and its rows reach the ledger once. A unique index allows one
  committed import per statement file (by SHA-256) and pot, so of two imports of the same file
  committed at once one writes its rows and the other is answered `409`.
- **CSV imports go through the ledger rules.** A reviewed file import ([import a CSV](csv-import.md))
  writes savings and budget rows keyed by `(source, externalId)`. Each amount is read in a stated
  notation, refused unless it fits whole cents and the 10^13 limit, summed in integer cents, and
  moves the balance (or the category's `spent`) only for rows actually inserted. A savings row in
  another currency than its account is refused, never converted; a budget row is converted to EUR
  at the stored rate or fails when there is none. Parents are locked before rows, and calls for
  one import run one at a time, so concurrent commits and overlapping imports write each row once.
- **Linked debt is read, not copied.** A property linked to an active mortgage takes its debt from
  the mortgage; an archived or missing linked mortgage contributes no debt. Mortgage debt is
  deducted inside property equity and never counted again as a liability. Equity is derived on
  the server on every read and never stored; a mortgage reads its property's address and value
  the same way, so loan-to-value follows the property's valuations.
- **Past debt comes from the debt's ledger.** The net worth history values a property at a past
  point by its latest valuation by then (its purchase price before the first, its current value
  when none is in effect yet), and its debt by its mortgage's balance plus the principal the mortgage's
  repayments applied after that point (less what a zero balance absorbed).
- **Totals reconcile.** For each partner, the dashboard allocations, the totals a client derives
  from the list endpoints with the shared rules the pages use, and the same aggregate computed in
  SQL with each row rounded to cents agree to the cent. A stored snapshot's total matches the live
  figure, and its components add up to it exactly.
- **Snapshot audit field.** `net_worth_snapshots.computed_at` records when a snapshot row was last
  computed. It is an audit field that nothing reads, and it stays in the schema and in backups.

### Known exceptions

These are recorded, not yet fixed:

- **Odd-cent joint amounts.** Each partner's total rounds its half of an odd-cent joint amount
  away from zero, so the two partners' totals can exceed the household's by one cent per such
  amount.
- **Repayments recorded before 0.9.0.** They carry no clamped principal. One that was clamped
  still restores its full principal (at most one cent too much). Quro does not guess it for old
  rows.
- **Provider balances.** A bunq-synced savings account takes its balance from bunq; its imported
  transactions are a record and do not move the balance.

## Source, as-of, estimated and missing data

Every derived figure says where its inputs came from and whether any input is a fallback.

| Indicator | Meaning                                                       | Exposed today                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source    | Who supplied a value                                          | FX `provider`; holding `manualPrice` and `excludeFromSync`; budget `sourceProvider`, `sourceAmount`, `sourceCurrency`; runway `taxRateSource`, `salaryBasis.status`, `durationSource`, `burnSource`; rule `sources` |
| As-of     | When a value was true                                         | FX `sourceDate` and `updatedAt`; holding `priceUpdatedAt`; runway `asOf` and `jurisdiction.rulesEffectiveFrom`; history point `date`; rule `effectiveFrom`, `effectiveTo`, `reviewedAt`                             |
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
- **Only rules in use are listed.** The runway's `jurisdiction.rulesEffectiveFrom` and
  `isExtrapolated` cover the rules the runway used. The default tax rate counts only when no
  payslip supplied a rate (`taxRateSource` is `jurisdiction_default`); a runway that used no rule
  reports `rulesEffectiveFrom: null`. The tax rate comes from the latest twelve payslips by date,
  and payslips that share a date are taken in the order they were entered.

The interface shows these indicators the same way everywhere, through the `StateNotice` component
and the figures' own marks (a `~` before an estimated total, an "Estimated" status in a chart's
data table):

- **Stale FX.** A synced rate is stale 48 hours after `updatedAt`. A notice under the header names
  the stale currencies and the date of the oldest update; the rate stays in use.
- **Stale prices.** A synced holding price older than seven days is marked stale in its row, and the
  Investments page lists the holdings behind it. A manual price or a holding with sync off is a
  choice and is not flagged.
- **Needs review.** Budget amounts without a recorded currency are read as EUR and a notice says
  so on the Budget and Plan pages.
- **Failed loads.** A page whose required data fails shows the route error state with a retry. A
  secondary list (archived items, spending classes, banking entities, price history) shows its own
  notice with a retry, never an empty list.

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

## Cross-view divergences

On 2026-10-09 the frontend and backend computed several figures separately and differently.
Positions, property types, ledger signs, joint shares and money totals now come from
`@quro/shared` (`packages/shared/src/domain/` and `sumMoney`), and a golden household asserts
that the dashboard and the pages show the same totals to the cent
(`packages/shared/test/fixtures/goldenHousehold.ts`).

### Corrections

Each correction changed a figure a user can see. Old and new values are from the golden
household and a synthetic household run before and after the change.

| Topic                        | Before                                                                                   | Now                                                                                     | Example (before → now)                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Oversold holding             | Dashboard netted buys and sells; the investments page clamped each sell, so it held more | One rule: buys minus sells, floored at zero; the excess sold has no cost                | buy 10, sell 15, buy 10: page 10 shares (value 130.00) → 5 shares (65.00), as on the dashboard     |
| Fractional shares            | Float sums left residues                                                                 | Shares counted in millionths                                                            | buy 0.1, buy 0.2, sell 0.3: 5.6 × 10^-17 shares, history month marked estimated → 0, not estimated |
| Cost basis and realised gain | Float products of shares and price                                                       | Each trade costed in cents                                                              | buy 10 at 40.123456, buy 5 at 41.50, sell 3 at 45: realised 13.253088 → 13.25; cost basis 486.98   |
| Investment property type     | The page matched four exact labels; the API also accepted other spellings and `rental`   | One case-insensitive rule including `rental`                                            | `buy-to-let`, `rental`: rent and expense rows hidden → offered, as the API accepts them            |
| Pension transaction effect   | The pension chart added unknown types                                                    | Unknown types do nothing, as on the server                                              | a `transfer` of 100 a month ago: last year's chart point 100 lower → unchanged                     |
| Pension balance              | The pension page showed a negative pot as 0 and its total left it out                    | Shown and counted as stored, as on the dashboard                                        | pots of 30,000.50 and -50: page 30,000.50 → 29,950.50                                              |
| Savings unknown types        | Added their amount                                                                       | Do nothing (writes only accept the three known types)                                   | a stored `transfer` of 7: +7 → 0                                                                   |
| Joint share                  | `0.5` constants in three places                                                          | `householdShare` everywhere                                                             | same value                                                                                         |
| Savings page total           | Summed full balances of joint accounts                                                   | Counts a joint account at the household share; account rows still show the full balance | a 6,000.01 joint account: page 6,000.01 → 3,000.01, as on the dashboard                            |
| Money totals                 | Float sums, rounded only when shown or stored                                            | Sums of cents, each amount rounded once                                                 | joint GBP 4,000.03 and EUR 6,000.01 at 1.18: 5,360.0227 (shown 5,360.02) → 5,360.03                |
| Holding value in a total     | Unrounded inside the total                                                               | Rounded to cents once, then added                                                       | 3 shares at 123.4567: 370.3701 → 370.37 (shown 370.37 both times)                                  |
| Percentages                  | `formatPercent` ignored the user's number format                                         | Uses it, with grouping                                                                  | 1.84 and 1234.5 for de-DE: `1.84%`, `1234.5%` → `1,84%`, `1.234,5%`                                |

Runway months move in their sixth decimal because burn and liquidity totals are now sums of
cents (for example 4.762747 → 4.762749 months).

### Remaining divergences

| Topic                      | Backend                                                                                                                 | Frontend                                                      | Example                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Savings history            | Each account floored at zero, UTC months                                                                                | Total floored, rounded to whole units, local-calendar months  | months differ around midnight on the first for users outside UTC          |
| Current month vs dashboard | History floors negative savings and debt balances, leaves out future-dated rows, and prices holdings from price history | Dashboard allocations use current balances and `currentPrice` | an overdrawn account lowers allocations but not the current history point |
| FX staleness               | None                                                                                                                    | Stale 48 hours after `updatedAt`, shown as a notice           | a provider outage is visible only to the frontend                         |

## Where the tests live

| Invariant                                                         | Tests                                                                                                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cent rounding, round trips, float sums                            | `packages/shared/test/moneyPolicy.test.ts`, `packages/backend/src/db/driverNumeric.test.ts`                                                                                 |
| Money input: cents, the 10^13 limit, non-money untouched          | `packages/backend/src/lib/requestValidation.test.ts`, `packages/backend/src/routes/moneyInput.integration.test.ts`                                                          |
| Unit prices: six decimals, dividends in cents, value              | `packages/backend/src/routes/holdingPrices.integration.test.ts`, `packages/backend/src/lib/holdingPriceBatch.integration.test.ts`                                           |
| Allocation identities, order, additivity, FX, linked debt         | `packages/backend/src/lib/financialInvariants.test.ts`                                                                                                                      |
| Joint shares, signs, missing data                                 | `packages/backend/src/lib/financialInvariants.test.ts`, `packages/backend/src/lib/partner.test.ts`                                                                          |
| Positions, signs, property types, shares, sums, percents          | `packages/shared/test/domainMaths.test.ts`                                                                                                                                  |
| Dashboard and page totals agree (golden household)                | `packages/backend/src/lib/goldenHousehold.test.ts`, `packages/frontend/src/features/goldenHousehold.test.ts`                                                                |
| FX cut-offs and fail-closed rates                                 | `packages/backend/src/lib/currencyRateCache.test.ts`                                                                                                                        |
| Ledger balances under random edits, moves and deletes             | `packages/backend/src/routes/ledgerInvariants.integration.test.ts`                                                                                                          |
| Concurrent edits, deletes and import commits                      | `packages/backend/src/routes/ledgerConcurrency.integration.test.ts`                                                                                                         |
| Clamped repayments, valuations and current value, archive vs edit | `packages/backend/src/routes/ledgerCorrectness.integration.test.ts`                                                                                                         |
| Property and mortgage ledgers separated (migration preflight)     | `packages/backend/src/db/propertyMortgageLedgerMigration.test.ts`                                                                                                           |
| Expected mortgage repayment                                       | `packages/shared/test/mortgageRepayment.test.ts`                                                                                                                            |
| One committed import per statement (migration preflight)          | `packages/backend/src/db/ledgerCorrectnessMigration.test.ts`                                                                                                                |
| Golden household reconciliation across API, pages and SQL         | `packages/backend/src/routes/householdReconciliation.integration.test.ts`                                                                                                   |
| CSV import: parsing, locale, duplicates, batches, balance check   | `packages/backend/src/lib/csvImport/csvImport.test.ts`, `packages/backend/src/routes/csvImports.integration.test.ts`, `packages/backend/src/db/csvImportsMigration.test.ts` |
| Repeated bunq imports                                             | `packages/backend/src/routes/budget-currency.integration.test.ts`, `packages/backend/src/services/bunqBudgetBatch.integration.test.ts`                                      |
| Stale and extrapolated rules                                      | `packages/backend/src/lib/jurisdictions/jurisdictions.test.ts`, `packages/backend/src/routes/plan.integration.test.ts`                                                      |

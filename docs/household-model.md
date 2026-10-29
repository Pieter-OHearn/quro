# Household totals and currency policy

The backend owns financial calculations. The frontend formats and converts their
results into the selected display currency; it does not reconstruct net worth or
identify allocations by their display names. The arithmetic policy and the ledger
invariants these totals rely on are in [financial invariants](financial-invariants.md).

## Household attribution

`lib/partner.ts` owns access and attribution: owned rows plus an accepted partner's
joint rows are visible, and joint money contributes 50% to each person's totals.
The share itself is `householdShare` in `@quro/shared`, so pages that weight a joint
row (the savings total, the portfolio's joint properties, the dashboard's monthly
summary) use the same rule as the server. `scopeHouseholdRows` lists money columns
explicitly so identifiers, rates and dates are never scaled. Child transactions inherit jointness from their parent, including
transactions entered by the other partner. Nullable principal stays nullable.

Runway's “count full joint balances” assumption applies to liquidity and derived
cashflow. Contractual payments and deposit-protection exposure retain the person's
50% share. This preserves the existing planning semantics.

Brokerage holdings are not shared: a holding has no joint flag, so net worth, the Exposure view
and every other holdings figure count only the caller's own holdings, whether or not a partner
is linked. See [Exposure and its facts](exposure-facts.md).

## One partner link per user

A user can belong to at most one link, as requester or addressee, whether it is
pending or accepted. The `partner_link_members` table enforces this: each link has
one row per participant, and `user_id` is its primary key. A second link for the
same user fails with a unique violation, which the invite route maps to
`409 Conflict`. Members are removed with their link through `ON DELETE CASCADE`.

The unique indexes on `partner_links` alone cannot do this, because "A invites B"
and "C invites A" touch different index entries and can both commit. Any code that
inserts into `partner_links` must insert both member rows in the same transaction.

Migration `0034` checks for existing duplicates before it backfills the members. If
any user appears in more than one link, it aborts with the user and link IDs and no
other data. Resolve those rows by hand and re-run the migration; it never repairs
them automatically.

`partner_links.responded_at` records when the addressee accepted. It is an audit field:
nothing reads it, and it stays in the schema and in backups.

## Property debt

A property is the asset and a mortgage is the loan. A property's only debt is its linked
mortgage while that mortgage is active; a property without one has no debt, and there is no
debt kept on the property itself. `getPropertyDebt` resolves the linked mortgage's outstanding
balance on read, and nothing copies it: the property stores no balance, and the mortgage stores
neither the property's address nor its value, which mortgage responses read from the linked
property (`linkedPropertyId`, `propertyAddress`, `propertyValue`).

Property responses carry three server-derived figures: `debt` (the linked active mortgage's
whole outstanding balance, 0 without one), `totalEquity` (`currentValue - debt`) and `equity`.
`equity` weights the value by the property's household share and the debt by the mortgage's own
share, exactly as the dashboard's net worth does, so the property card, the mortgage page and the
dashboard show one figure even when the two rows' jointness differ. Negative equity is preserved.

Archived mortgages contribute no current debt, restoring a mortgage restores its contribution, and
unlinking leaves the property with no debt. Mortgage debt is deducted in property equity;
`liabilitiesTotal` contains non-mortgage debts, avoiding double counting. Completed monthly
snapshots retain their historical values. The net worth history rebuilds a property's past debt
from its mortgage: the current balance plus the principal its repayments applied after the
point, each repayment weighted by its mortgage's share.

## API contract

Dashboard allocations return `netWorth`, `portfolioTotal`, `totalAssets`, `currency`,
`liabilitiesTotal`, `liabilitiesCurrency`, and `debtCount`. Allocation keys are
`savings`, `brokerage`, `property_equity`, and `pension`. Names are presentation text;
chart colours live on the frontend.

Net worth history (`GET /api/dashboard/net-worth`) returns points of `id`, `month`, `year`,
`date` (the point's as-of date), `totalValue`, `currency` and `isEstimated`, oldest first and
ending with today. `range` selects the period:

| `range`       | Points                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| `6m` (absent) | The last six month ends, then today. `/api/dashboard/summary` uses this one. |
| `1y`          | The last twelve month ends, then today.                                      |
| `1m`          | One point per day for the last 30 days, then today.                          |
| `all`         | Month ends from the household's first dated record, at most 360 months back. |

Any other `range` answers 400. The first dated record is the earliest ledger row the history
replays (the caller's rows and the partner's joint savings and property rows) or stored
snapshot; a partner's private rows never move it. Month-end points use a stored snapshot when one
exists; daily points and today are always rebuilt from the ledgers and the stored rate and price
history, because snapshots are month-end figures. A household with no history answers one point
for today in every range. The dashboard's range control changes only the chart: the hero keeps
comparing with the previous month.

The summary also returns `yearStart`, the point the hero's "year to date" change measures from,
built like a history point (stored snapshot or ledger replay, FX at its cut-off, household share,
`isEstimated`): the value at 31 December of the previous year (`from: "previous-year-end"`) when
the household has a dated record before 1 January, otherwise its first month end of this year, or
today when that is this month (`from: "first-point"`; the hero then reads "since Mar 2026"). It is
`null` without any record. The hero shows no percentage when that value is zero or negative.

Derived dashboard and runway amounts are in EUR, labelled by their response
currency. Native asset and transaction endpoints keep their own currencies. Inputs
are converted to EUR before aggregation; the frontend converts aggregate EUR values
once for display. Runway no longer walks its response to convert each money field.
Its `baseCurrency` now identifies the calculation currency, always EUR, rather than
the user's preference. Deploy the shared contract, backend and frontend together.

Budget category `budgeted`/`spent` and transaction `amount` are stored in EUR,
with database constraints enforcing `currency = EUR`. Manual POST/PATCH payloads
accept an explicit input `currency`; omission always means EUR, independently of
user preferences. Monetary fields are converted using the cached current rate and
rounded to cents once on write. Transaction `sourceAmount` and `sourceCurrency`
retain the native input for audit and Bunq matching. Edits, moves, deletes and
monthly templates operate on the stored EUR values. Bunq uses the payment's
currency, never the display preference; repeated confirmed imports do not revalue
existing payments. The budget UI converts EUR to the selected display currency
and sends that currency explicitly when entering a new monetary value.

Migration `0031_budget_currency_provenance.sql` pins existing numeric amounts to
the pre-WP6 EUR interpretation and marks them `currencyNeedsReview = true`. It
retains transaction amounts in `sourceAmount`, leaving `sourceCurrency` unknown.
Neither historical manual input currencies nor payment currencies were stored.
Current preferences and editable linked-account currencies cannot recover that
history, so the migration deliberately does not guess or apply FX to these rows.
Budget and Plan display a review notice; runway marks the result estimated while
any relevant record remains unresolved. A repeated Bunq import can recover a
payment's authoritative currency, normalize it at the current cached rate, and
adjust the category aggregate by the EUR delta exactly once. The regular sync
cursor may not fetch older payments; those require an explicit historical replay
or statement-based correction. Historical settlement FX rates cannot be recovered.

To remediate manually, PATCH each affected transaction with its verified `amount`
and input `currency`; this also adjusts its category's `spent`. Then PATCH each
legacy category with **both** verified `budgeted` and `spent` in one explicit
`currency` to clear its review flag (avoid double counting already corrected
transactions). Partial/nonmonetary edits retain the flag. The current category
editor changes the budget limit only; full legacy aggregate corrections use the
API after statement review. Reconcile before relying on migrated foreign budgets.

Monetary plan assumptions retain their existing preference-based input contract.
Historical cashflow retains the parent currency and household share for archived
savings accounts. Ratios, durations, percentages and eligibility flags are never
currency-converted.

## Jurisdiction profiles

Profiles own the unemployment model, source metadata, warnings, and UI labels.
Runway sends its model and labels to the client, which selects controls by model
capability. NL salary replacement, AU manual estimates and the generic unsupported
model retain their existing rules and effective dates.

## Regression coverage

- Fixed pre-refactor allocation and runway numbers, mixed currencies and negative equity.
- Both partners' allocations, snapshots and current history agree after either ledger's repayments.
- Linked debt and equity on property reads, repayment edits/reversals, archive/restore and unlink;
  each ledger refusing the other's transaction types.
- Private/archived assets and unauthorized property reads.
- Foreign budget conversion, monetary overrides, joint liquidity and contractual payments.
- Authoritative client totals with empty allocations and translated allocation names.
- A golden two-partner household whose dashboard, list-endpoint and SQL totals agree to the
  cent after partner repayments, joint deposits, moves and deletes.

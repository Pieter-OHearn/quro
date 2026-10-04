# Household totals and currency policy

The backend owns financial calculations. The frontend formats and converts their
results into the selected display currency; it does not reconstruct net worth or
identify allocations by their display names.

## Household attribution

`lib/partner.ts` owns access and attribution: owned rows plus an accepted partner's
joint rows are visible, and joint money contributes 50% to each person's totals.
`scopeHouseholdRows` lists money columns explicitly so identifiers, rates and dates
are never scaled. Child transactions inherit jointness from their parent, including
transactions entered by the other partner. Nullable principal stays nullable.

Runway's “count full joint balances” assumption applies to liquidity and derived
cashflow. Contractual payments and deposit-protection exposure retain the person's
50% share. This preserves the existing planning semantics.

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

## Property debt

`getPropertyDebt` resolves an active linked mortgage's outstanding balance. The
stored `properties.mortgage` amount is used only for unlinked properties. Linked
repayments update the mortgage ledger, and property API responses resolve the debt
on read. Existing stale copies are ignored; no destructive data migration is needed.

As before, archived mortgages contribute no current debt, restoring a mortgage
restores its contribution, and unlinking clears the property's manual debt. A new
manual balance can then be entered. Mortgage debt is deducted in property equity;
`liabilitiesTotal` contains non-mortgage debts, avoiding double counting. Negative
equity is preserved. Completed monthly snapshots retain their historical values.

## API contract

Dashboard allocations return `netWorth`, `portfolioTotal`, `totalAssets`, `currency`,
`liabilitiesTotal`, `liabilitiesCurrency`, and `debtCount`. Allocation keys are
`savings`, `brokerage`, `property_equity`, and `pension`. Names are presentation text;
chart colours live on the frontend.

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
- Stale property copies, repayment edits/reversals, archive/restore, unlink and manual debt.
- Private/archived assets and unauthorized property reads.
- Foreign budget conversion, monetary overrides, joint liquidity and contractual payments.
- Authoritative client totals with empty allocations and translated allocation names.

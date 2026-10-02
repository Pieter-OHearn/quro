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

Budget amounts and monetary plan assumptions are stored in the user's base
currency, so runway converts them on input too. This corrects the previous handling
of non-EUR budgets as EUR. Historical cashflow also retains the parent currency
and household share for archived savings accounts. Ratios, durations, percentages and eligibility flags are
never currency-converted.

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

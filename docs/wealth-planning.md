# Wealth planning

Quro's planning views are derived estimates. They combine recorded balances, transactions, payslips,
budget categories, and effective-dated jurisdiction rules. They are not personalised financial or
investment advice, and the interface does not present a probability-of-success score.

## Runway

Runway estimates how long accessible resources could cover lean spending after employment income
stops. The calculation draws cash first, then term deposits and brokerage assets with visible
haircuts. It can add notice pay, severance, and unemployment support when the selected jurisdiction
and employment details support those calculations.

The resilience bands use the Financial Health Network's published six-month emergency-savings
anchor. They describe the model output; they are not recommendations. Benefit eligibility that Quro
cannot verify is listed alongside the result instead of being presented as confirmed.

Dutch and Australian employment and planning rules are effective-dated in
`packages/backend/src/lib/jurisdictions/`. Source links live beside each value so moving statutory
figures are updated in one place. Rules past their published period are carried forward explicitly
and labelled as extrapolated.

For Australia, Quro applies the Fair Work continuous-service redundancy weeks table to estimated
weekly base pay. It does not derive JobSeeker Payment from salary because Services Australia applies
personal, household-income, and assets tests; users can instead enter their own monthly estimate and
planning duration. Australian deposit protection uses APRA's Financial Claims Scheme limit of
A$250,000 per account holder per Australian-incorporated ADI and treats only AUD deposits as covered.

## Derived spending

When at least two months of budget history exist, essential spending is derived from monthly
envelopes and annual irregulars are amortised across the observed period. Employment-linked and
discretionary spending remain in current burn but not lean burn. Mortgage and minimum debt payments
remain in both because they are contractual.

When envelope history is too thin, Quro derives total spending from net payslip income and changes in
liquid balances. In that fallback, lean and current burn are intentionally equal; the app does not
invent an essential-spending split.

## Estimates and historical values

Historical net worth uses the last market close and FX rate at or before each month cutoff. History
before the first stored rate or price falls back to the available value, is marked `isEstimated`, and
renders as a dashed segment. Estimated headline values carry a `~` prefix.

## Joint ownership and deposit protection

Joint balances use a 50% display share by default so linked partner views add to the real total. The
advanced runway assumptions can count a full joint balance for accessibility modelling. Deposit
guarantee checks use the same 50% attributed share until explicit ownership shares are available.

Deposit balances are grouped by licensed entity rather than free-text brand. Unresolved institutions
are shown as unverified; the app does not imply coverage it could not confirm.

Deposit protection follows the licensed banking entity rather than the user's planning
jurisdiction. A portfolio can therefore contain accounts protected under different national
schemes. Planning jurisdiction affects employment and planning rules only; changing it does not
change a confirmed banking entity or the money available to the runway calculation. Automatic
matching is used only for unambiguous brands. Ambiguous names require confirmation, and unresolved
accounts are not assigned a fallback scheme or cap.

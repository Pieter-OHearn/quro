# Changelog

All notable changes to this project will be documented in this file. The format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses [Semantic Versioning](https://semver.org/) for release numbers. ￼

## [v0.5.1] - 2026-08-12

- Decouple licensed banking entities and deposit-protection calculations from the employment
  planning jurisdiction, allowing mixed-country bank accounts without inventing coverage for
  unresolved institutions.

## [v0.5.0] - 2026-08-12

- Add a new Plan tab centred on financial resilience, with an income-stop runway that combines lean spending, accessible balances, notice pay, severance, and applicable income support into a month-by-month projection.
- Show cash-only and all-liquid runway comparisons, configurable liquidity tiers and haircuts, current and lean burn rates, and an advanced assumptions editor so users can understand and adjust the model.
- Add shared employment records across Plan and Salary, including an editable employer, employment type, start and end dates, and notice period. Tenure now updates automatically from the stored start date and feeds notice and severance calculations.
- Add effective-dated planning rules for the Netherlands, including WW and transition-compensation estimates, and for Australia, including Fair Work redundancy bands, user-confirmed JobSeeker estimates, and APRA Financial Claims Scheme coverage for eligible AUD deposits.
- Add a calculation review that separates included, excluded, and unverified support components, explains the inputs and assumptions used, and links to the relevant official sources.
- Add banking-entity review and deposit-guarantee modelling, grouping accounts by licensed entity, weighting joint ownership, applying jurisdiction-specific protection caps, and surfacing unresolved entities or modelled exposure with actionable guidance.
- Add spending-category classifications for essential, discretionary, and employment-linked costs so the runway can derive a more realistic lean monthly burn without silently inventing missing data.
- Improve historical net-worth accuracy with dated FX rates and holding-price snapshots, while clearly marking chart values that rely on estimated historical rates or prices.

## [v0.4.1] - 2026-08-05

- Add annuity and linear mortgage repayment methods, including method-aware balance projections, form controls, and clear mortgage summary labels.
- Fix mortgage time remaining calculations to use the contractual end date and support human-readable stored dates.

## [v0.4.0] - 2026-08-04

- Add dismissible fixed-rate expiry reminders to the notification centre during the six months before a mortgage's fixed term ends, with direct links to the relevant mortgage.
- Fix joint property equity throughout investment totals, trend calculations, charts, and property rows so each partner sees the correct ownership share.
- Make debt, holding, mortgage, and property balance changes atomic in the database, preventing concurrent repayments or transactions from overwriting one another.
- Improve authentication and account isolation by rate-limiting sign-in attempts per account and partner invites per user, handling concurrent sign-ups cleanly, reacting to invalidated sessions globally, and clearing cached account data when sessions change.
- Surface failed data requests on the debts, goals, investments, and mortgage pages instead of silently rendering incomplete financial data.
- Fix stale investment ticker searches, show clear conflicts when deleting budget categories that are still in use, and refresh dashboard data after Bunq settings or sync changes.
- Improve performance by bounding budget transaction history and recent dashboard activity queries, and by indexing transaction parent references used for reconciliation.
- Expand automated coverage for authentication, rate limiting, financial balance reconciliation, request validation, readiness checks, savings updates, and mortgage notifications.
- Update frontend, backend, CI, and pension parser dependencies, and add grouped Python dependency updates to Dependabot.

## [v0.3.2] - 2026-06-22

- Fix Bunq savings sync misclassifying payday interest payments as deposits by detecting the `PAYDAY` payment type.
- Fix mortgage rate type validation to read from the shared `MORTGAGE_RATE_TYPES` enum instead of a duplicated local type.
- Fix savings transaction modals closing before the save request resolved, which could drop failed saves silently.
- Fix property records allowing a `mortgageId` that no longer pointed at an existing mortgage by adding a foreign key constraint with `ON DELETE SET NULL`.
- Fix holding price sync skipping valid price updates whenever a snapshot also produced an issue for the same ticker.

## [v0.3.1] - 2026-06-15

- Fix Bunq OAuth callbacks so redirects that return without a Quro session cookie are authenticated via the HMAC-signed `state` parameter, while forged or malformed states redirect back to settings with an error.
- Fix pension pot editing in browser contexts without `crypto.randomUUID()` by using a client ID helper with Web Crypto and non-crypto fallbacks.
- Patch `form-data`, `@babel/core`, `starlette`, and `python-multipart` audit advisories through workspace and pension-parser dependency updates.

## [v0.3.0] - 2026-06-13

- Add partner linking so two accounts can share joint assets: invite/accept/decline/unlink flow, joint toggles on savings accounts, properties, and mortgages, joint badges across lists and the dashboard, and 50% weighting of joint assets in net worth, allocations, and the monthly summary.
- Add property archiving and deletion with mortgage-link reconciliation: soft-delete by default, outstanding balances reconciled across mortgage and property transactions, and archived linked mortgages treated as zero balance in current and historical dashboard equity.
- Add archive-by-default deletion for holdings, pension pots, mortgages, and debts, with a balance-aware warning dialog and restore support, preserving historical net worth instead of rewriting past wealth-chart months.
- Add editing of existing mortgage transactions from the UI, with a live balance preview for the edited repayment.
- Rebrand the design system around semantic tokens (brand, surface, border, text, status, shadow, motion) and a shared responsive DataTable, migrating buttons, badges, cards, forms, budget category progress rows, and financial tables onto the new system.
- Update Hono to 4.12.18 to resolve security advisories (CSS injection via JSX SSR, JWT NumericDate validation, and cache middleware cross-user leakage).
- Harden authentication: rate-limit the change-password endpoint, equalise sign-in password verification timing, and require owners on financial records.
- Fix a memory leak in the rate limiter by evicting expired entries.
- Map numeric database columns to numbers so financial values cross the wire as numbers rather than strings, and validate pension pot types against a shared enum.
- Improve request performance by collapsing authentication to a single JOIN query.
- Scope budget cache invalidation to the affected month, wrap savings balance updates in a transaction, and consolidate the goal normalizer so the dashboard and goals page stay consistent.
- Routine dependency updates and security patches across the workspace and the pension-parser service.

## [v0.2.1] - 2026-05-08

- Add goal editing with month-based tracking, including start month and missed month support.
- Add automatic currency rate syncing and caching backed by the database, with Yahoo Finance sync on startup, scheduled daily refreshes, stale metadata handling, and safer failure behaviour for missing non-EUR rates.
- Improve session query performance with additional indexes.
- Improve the iOS web app experience.
- Fix modal backdrop viewport coverage.
- Improve salary growth history by showing stacked net pay and deductions when payslip data is available.

## [v0.2.0] - 2026-05-06

- Show actual savings deposits in monthly summary card.
- Order the payslip table by payday.
- Add holding price sync scheduler to keep prices up to date.
- Add goal linking system with four new source types: portfolio goals auto-resolve from live brokerage value, net worth goals auto-resolve from live net worth calculation, invest habit goals auto-track monthly completion by counting distinct months with buy transactions, and savings account goals now link to real accounts.

## [v0.1.3] - 2026-05-04

- Switch investment market data lookup and price syncing to Yahoo Finance, removing the Marketstack API key and deployment wiring.
- Add manual holding price overrides and an option to exclude holdings from automatic price sync.
- Show manual price and sync status in the brokerage holdings table.
- Fix salary growth history charts so mixed-currency entries in the same year render as one combined annual bar.

## [v0.1.2] - 2026-05-04

- Support joint account budget imports from Bunq.
- Preserve transaction history when removing savings accounts, with optional full delete.
- Refactor Debts page into modular components.
- Improve mortgage amortization calculations with dynamic projection periods and per-month precision.
- Add mortgage metrics unit tests.
- Enhance validation utilities and password constraints in shared types.
- Improve goals feature with dedicated year utilities.
- Update backend schema for Bunq account metadata tagging.

## [v0.1.1] - 2026-05-03

- Allow savings accounts to be removed without deleting their transaction history, while keeping an explicit full-delete option for removing both the account and its transactions.

## [v0.1.0] - 2026-05-03

- Introduce the Bunq connection and auto-import flow, including OAuth account linking, connected-account settings, savings account/transaction imports, and budget transaction imports from Bunq payments.

## [v0.0.2] - 2026-03-18

- Fix the backend Docker/release database configuration so Postgres resolves via `db:5432` instead of falling back to `127.0.0.1`, including support for Docker secret-based credentials and release-time migrations.

## [v0.0.1] - 2026-03-15

- First MVP test release: stood up the initial backend/frontend services, Docker orchestration, and CI skeleton to prove the deployment flow end to end.

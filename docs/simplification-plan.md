# Codebase Simplification Plan

Output of a whole-codebase `/simplify` review (reuse, simplification, efficiency and altitude
angles). Findings were deduplicated and grouped into work packages (WPs) that can each ship as
one or a few PRs. **Nothing here is a correctness-bug report** — use `/code-review` for that. No
code was changed; line numbers are as of commit `382f6bb` and may drift.

Paths are relative to `packages/`. `BE` = `backend/src`, `FE` = `frontend/src`.

## Overview

| WP  | Title                                            | Area     | Size | Risk   | Depends on |
| --- | ------------------------------------------------ | -------- | ---- | ------ | ---------- |
| 1   | Dead code removal                                | Both     | S    | Low    | —          |
| 2   | Backend request-validation consolidation         | Backend  | M    | Low    | —          |
| 3   | Shared money, date & finance utilities           | Shared   | M    | Low    | —          |
| 4   | Backend domain-logic extraction                  | Backend  | M    | Medium | 2, 3       |
| 5   | Route infrastructure: auth, ownership, lifecycle | Backend  | L    | Medium | 2, 4       |
| 6   | Household & net-worth model                      | Both     | L    | High   | 4, 5       |
| 7   | Backend performance                              | Backend  | L    | Medium | (6 helps)  |
| 8   | Frontend data layer (query keys, hooks, typing)  | Frontend | L    | Medium | —          |
| 9   | Frontend performance                             | Frontend | M    | Low    | 8 helps    |
| 10  | Frontend state & component simplification        | Frontend | M    | Low    | 3          |
| 11  | UI consistency & design tokens                   | Frontend | L    | Low    | —          |

Suggested order: **1 → 2 → 3 → 8 → 4 → 9 → 10 → 11 → 5 → 7 → 6**. WPs 1–3 are pure extractions
and deletions with the best payoff-to-risk ratio; WP 6 changes data semantics and should come last.

---

## WP 1 — Dead code removal

Straight deletions of verified-unused code. Confirm with a final grep before deleting.

- **Unused password-strength code:** `FE/features/landing/components/PasswordStrengthMeter.tsx`,
  `FE/features/landing/utils/password.ts`, `PasswordStrength` type (`landing/types.ts:48`). Settings
  has its own 50-line `getPasswordStrength` (`FE/features/settings/SettingsPage.tsx:185-235`) —
  either delete the landing copy or keep one table-driven version and use it in Settings.
- **Six unused hooks:** `useCreateBudgetTransaction`, `useDeleteBudgetCategory`,
  `useRefreshHoldingPrice`, `usePensionStatementImports`, `useSyncBunqBudget`, `useSyncBunqSavings`
  (referenced only by their own file + barrel). Afterwards decide whether `POST /api/bunq/sync/*`
  and `/holdings/:id/refresh-price` are still needed.
- **Unused exports:** `deriveGoalDisplay` + `GoalDisplay`/`GoalSummaryItem` types
  (`FE/features/dashboard/utils/dashboard-data.ts:28`, `dashboard/types.ts:30,47`);
  `buildGoalYearOptions` (`goals/utils/goal-years.ts:7`);
  `normalizePensionStatementImportSummary` (`pension/utils/pension-api-normalizers.ts:227`);
  `fetchStockPrice` (`BE/lib/marketData.ts:32`); `isCurrencyRateFresh`
  (`BE/lib/currencyRateCache.ts:56`); `getRepoRoot` (`BE/db/maintenance.ts:97`); unused `_now`
  param of `buildRatesToBaseCurrency`.
- **Unused table:** `dashboardTransactions` (`BE/db/schema.ts:1011`) is never read or written —
  confirm and drop via migration.
- **Test-only re-export:** `BE/routes/dashboard.ts:40` re-exports `computeDerivedAllocations` only
  for its test; import from `lib/netWorth` in the test instead.

---

## WP 2 — Backend request-validation consolidation

`BE/lib/requestValidation.ts` already provides table-driven parsers (`FieldParsers`,
`parseRequiredFields`, `parsePatchFields`, `parseId`, `readJsonBody`…). Several routes re-implement
it with different result shapes (`{ok, data}` vs `{ok, value}`) and looser rules.

- **salary.ts** (`BE/routes/salary.ts:26-170`) re-implements ~110 lines of the module plus its own
  `CurrencyCode` / `CURRENCY_CODES` — import from `requestValidation` and `@quro/shared`.
- **debts.ts** (`BE/routes/debts.ts:16, 98-182`) has its own `parseId` (no digits-only regex),
  `normalizeBody`, `parseRequiredString`, `parseOptionalString`, `parseIsoDate` (no calendar
  check), `ValidationResult`; uses raw `c.req.json()` at 453/496/508 — port to shared parsers.
- **employments.ts** (`BE/routes/employments.ts:57-116`) hand-written if-chain needing complexity
  suppressions — port to `FieldParsers`.
- **settings.ts** (`:28-38`) own `ParseResult` using `data`, `parseNumberValue` duplicates
  `parseInteger`.
- **Number coercion — 9 copies** of `toNumber`/`toFiniteNumber`: `mortgages.ts:120`, `debts.ts:108`,
  `pensions.ts:251`, `pension-imports.ts:139,144`, `lib/pensionParserClient.ts:52`,
  `lib/netWorth.ts:51`, `dashboard.ts:50`, `plan.ts:78`. Semantics differ (`Number` vs
  `parseFloat`, `0` vs `null`). Export `toFiniteNumberOrNull` / `toNumberOrZero` from
  `requestValidation.ts` (built on `parseNumber`); also check whether `numericAsNumber`
  (`BE/db/schema.ts:30-49`) already makes most of them unnecessary.
- **Small parsers duplicated:** `pickPatchedValue` (`goals.ts:296`, `investments.ts:132`,
  `mortgages.ts:106`); `parseOptionalId` (`investments.ts:104`, `mortgages.ts:99`);
  `parsePositiveNumberField` (`budget.ts:110`, `savings.ts:143`); `parseNormalizedDecimalField`
  (`investments.ts:223-240` vs `mortgages.ts:125-142` — same name, mortgage version doesn't
  normalize commas); optional date (`investments.ts:372`, `employments.ts:47`). Move to
  `requestValidation.ts`.
- **Types:** `DbTransaction` redeclared in 7 files (`savings.ts:128`, `mortgages.ts:298`,
  `debts.ts:14`, `investments.ts:810`, `budget.ts:104`, `pensions.ts:132`,
  `services/bunqBudgetSync.ts:32`), `DbExecutor` in 2 — export once from `BE/db/`.
- **Postgres error codes:** `auth.ts:35-42`, `partner.ts:14-20`, `budget.ts:38-42` each declare
  `23505`/`23503` — add `lib/postgresErrors.ts` with `isUniqueViolation`/`isForeignKeyViolation`.
- **Route mutation-error pattern:** `pensions.ts:461` has `isRouteMutationError`; others inline
  `'error' in result` — pick one.
- **Time constants:** `SECONDS_PER_MINUTE` etc. redeclared in the schedulers,
  `lib/currencyRateCache.ts:7-9`, `routes/auth.ts:30-33`; `sessionCleanup.ts:6` hardcodes
  `86_400_000`. `BE/constants/time.ts` already exists — import it, add `HOUR_MS`/`DAY_MS`.

---

## WP 3 — Shared money, date & finance utilities (`@quro/shared`)

Cross-package primitives re-derived ad hoc; each recent cent-precision fix (e.g. `382f6bb`) was
applied locally.

- **Money module** (`shared/src/utils/money.ts`): `toCents`, `fromCents`, `roundMoney`, `sumMoney`.
  Replaces ad-hoc rounding at `BE/routes/debts.ts:151,155`, `mortgages.ts:575`,
  `investments.ts:468`, `FE/features/debts/utils/debt-metrics.ts:24,89`, `debts/utils/forms.ts:178,205`,
  `savings/components/AccountModal.tsx:97`, private `toCents`/`fromCents` in
  `mortgage/utils/mortgage-metrics.ts:10-17`.
- **Finance helpers:** `monthlyInterest(balance, annualPct)` — `balance * rate / 100 / 12` inlined 5×
  (`AddMortgageTxnModal.tsx:206`, `debt-metrics.ts:24`, `AccountModal.tsx:97`,
  `AccountsList.tsx:200`, `savings-data.ts:42`); `monthsToPayoff` — same NPER formula in
  `mortgage-metrics.ts:185` and `debt-metrics.ts:27`.
- **Date module** (`shared/src/utils/date.ts`): `toIsoDate`, `todayIsoDate`, `toUtcTimestamp`,
  `monthStartUtc`, `monthEndUtc`, `addMonthsUtc`. Currently copied in
  `FE/features/investments/utils/position.ts:74-90`, `pension/utils/pension-calculations.ts:13`,
  `BE/routes/dashboard.ts:59-82`; `toDateOnly` in 5 places; 10 local `ISO_DATE_LENGTH` constants
  and ~31 inline `toISOString().slice(0, 10)`; "today" computed in UTC in 7 modals vs local time in
  `debts/utils/forms.ts:49`. Give `FE/lib/utils.ts:7 formatDate` an options arg and drop
  `debts/utils/forms.ts:42 formatShortDate`.
- **Month names:** 5 copies in goals (`goals-constants.ts:15`, `AddGoalModal.tsx:28`,
  `GoalCard.tsx:201`, `useEditGoalModal.ts:10`, `goal-utils.ts:210`) of shared `BUDGET_MONTHS` —
  rename to `MONTH_ABBREVIATIONS` (keep alias) and delete copies.
- **Formatting:** `formatPercent` for 34 ad-hoc `toFixed(n)}%` sites. Cache `Intl.NumberFormat`
  instances in `shared/src/utils/index.ts:18` (`formatNumber`/`formatCurrency` build a new one
  per call — hot in tables/charts).
- **Default emojis:** 14 fallback sites mixing `??`/`||` (e.g. `GoalsGlance.tsx:24`,
  `GoalCard.tsx:582`, `PensionModal.tsx:300`, `PropertyTab.tsx:310`, `budget-data.ts:39,56`) —
  `DEFAULT_EMOJI` map per entity kind, applied once in a normalizer/serializer.
- **Shared validators & payload types:** repayment split / interest ≤ amount rules are duplicated
  FE (`debts/utils/forms.ts:83,195`, `useMortgageTxnModal.ts:24`, `AddPropertyTxnModal.tsx:337`,
  `useAddPensionTxnForm.ts:126`) and BE (`debts.ts:144,274`, `mortgages.ts:563`,
  `investments.ts:484`, `pensions.ts:359`, `pension-imports.ts:193`); messages already differ. Put
  pure validators + request payload types in `@quro/shared`.

---

## WP 4 — Backend domain-logic extraction

Pure extractions of logic that is copied line-for-line between routes.

- **Pension transaction rules → `BE/lib/pensionTransactions.ts`:** `parsePensionTransactionType`,
  `parsePensionTransactionPayloadBase`, contribution/fee/annual-statement validators, payload types
  and `computePensionTransactionDelta` are duplicated in `routes/pensions.ts:85-460` and
  `routes/pension-imports.ts:64-290`; a third drifted copy of the delta is in `dashboard.ts:199`.
  Also replace `pension-imports.ts:41 TRANSACTION_TYPES` with shared `PENSION_TRANSACTION_TYPES`.
- **Repayment ledger → `BE/lib/balance.ts`:** debts (`debts.ts:150-181,369-413`), mortgages
  (`mortgages.ts:344-360,558-583`) and property (`investments.ts:465-500,836-899`) each implement
  principal split, ±0.01 check, atomic `GREATEST(0, bal - p)` update and reversal. `lib/balance.ts`
  exists for exactly this but is imported only by its test. Add
  `applyRepayment(tx, {table, balanceColumn, id, principal})` / `reverseRepayment` and use them.
- **Stored PDF documents → `BE/lib/pdfDocuments.ts`:** upload/replace/rollback flow duplicated in
  `salary.ts:264-354` and `pensions.ts:528-638` → `replaceStoredPdfDocument(...)`; download handler
  duplicated in `salary.ts:480-509` and `pensions.ts:1121-1150` → `streamStoredPdf(...)`.
- **Brokerage valuation:** `plan.ts:153-174 sumHoldingValue` re-implements
  `computeSharesByHolding` + brokerage reduce from `lib/netWorth.ts:56-95` — export and reuse.
- **Schedulers:** `bunqSyncScheduler`, `holdingPriceSyncScheduler`, `netWorthSnapshotScheduler`,
  `currencyRateSyncScheduler` share one skeleton; only one has the test-env guard. Extract
  `startIntervalJob({ name, intervalMs, runOnStart, run })`.

---

## WP 5 — Route infrastructure: auth, ownership, lifecycle

- **Default-deny auth:** `BE/index.ts:57-82` has 25 opt-in `app.use(path, requireAuth)` lines; the
  public list lives separately in `middleware/csrf.ts:6`. Use `app.use('/api/*', requireAuth)` with
  one shared `PUBLIC_PATHS` consumed by auth and CSRF middleware.
- **Resolve partner once per request:** `getAcceptedPartnerId` is called 39× (twice per request in
  `investments.ts:1421/1444`, `1474/1481`). Join `partner_links` in the session query in
  `middleware/auth.ts:14-18` and put `partnerId` on the context; `assertJointAllowed` takes it as a
  param.
- **Ownership / access helpers → `BE/lib/access.ts`:** ~12 `getOwnedX` selects (`budget.ts:189,197`,
  `goals.ts:300`, `investments.ts:794,802`, `salary.ts:251`, `pension-imports.ts:445,455`,
  `pensions.ts:497`, `debts.ts:311`) and ~7 `getAccessible*` with inconsistent arg order
  (`savings.ts:289,302`, `mortgages.ts:303`, `investments.ts:813,902,945`). Add
  `findOwnedRow`, `findAccessible`, `findAccessibleChild`, `listChildRows`; optionally a
  `withOwnedEntity(table)` middleware that parses id → checks ownership → 404s (73 `parseId`
  calls, ~130 hand-written "not found" responses).
- **Transaction list/get routes:** the same `GET /transactions?parentId=` + `GET /transactions/:id`
  pattern exists 5× (`savings.ts:603`, `mortgages.ts:718`, `investments.ts:1277,1576`,
  `pensions.ts:983`) — build on the helpers above.
- **Archive / unarchive / cascade-delete:** 6 copies (`debts.ts:515-545`, `savings.ts:568-590`,
  `mortgages.ts:877-915`, `pensions.ts:947-970`, `investments.ts:1143-1165,1537-1565`) →
  `registerArchivableResource(app, {path, table, scope})`.
- **Snapshot invalidation:** `invalidateSnapshotsFrom(tx, user.id, date)` is called by hand at ~28
  sites and only for the acting user (not the partner on joint entities). Wrap in a single
  `withLedgerWrite(tx, entity, date)` that resolves all affected household user ids.
- **Split oversized route files:** `routes/dashboard.ts` (1,341 lines) → move net-worth history and
  activity mapping to `lib/netWorthHistory.ts` / `lib/activity.ts`; `routes/investments.ts`
  (1,733 lines) → `holdings.ts` + `properties.ts`.

---

## WP 6 — Household & net-worth model

Semantic changes — do last, behind tests comparing before/after numbers.

- **Single source of truth for linked property mortgages:** `properties.mortgage` is a hand-synced
  copy of `mortgages.outstandingBalance` (`mortgages.ts:319-327,360,393`, `investments.ts:836-899`);
  readers pick a copy (`lib/netWorth.ts:100-104`, `dashboard.ts:650`); frontend compensates in
  `investments/utils/query-invalidation.ts:5`. Keep `properties.mortgage` only for unlinked
  properties and resolve via one `getPropertyDebt(property)`.
- **Joint 50% weighting defined 4×** with different mechanisms (`dashboard.ts:48,242-310`,
  `lib/netWorth.ts:18,213-221`, `lib/runway.ts:17,150,236,897`, `plan.ts:64,440,552`). One household
  scoping layer next to `ownedOrJointPredicate` in `lib/partner.ts`, e.g.
  `loadHouseholdRows(table, userId, {weight})` with per-table money-column lists.
- **Net worth computed on the client:** recomputed in `goals/hooks/useAddGoalModal.ts:53-66`,
  `useEditGoalModal.ts:79-92`, `useGoalsComputations.ts:42-54`, `dashboard/utils/dashboard-data.ts:127-145`,
  finding brokerage by display name (`a.name === 'Brokerage'`) and guessing currency from
  `allocations[0]`. API should return `netWorth`, `portfolioTotal`, a stable `key` per allocation
  and `liabilitiesCurrency`; move colour mapping (`netWorth.ts:118-121`) to the client.
- **One currency-conversion policy:** dashboard/allocations return EUR and the client converts
  again (61 `convertToBase` calls in 38 files); `plan.ts:224-260,617-619` converts server-side via a
  hand-listed field walker (`convertEurResponse`). Pick one layer and drop the walker.
- **Jurisdiction strategy table:** `lib/jurisdictions/index.ts` has a profile type, yet
  `lib/runway.ts:409,451,481-489,574,607` and FE (`plan/PlanPage.tsx:43-46`,
  `AssumptionsDrawer.tsx:172-247`, `CalculationReviewModal.tsx:27-28`) branch on the code. Extend the
  profile with sources, warnings, unemployment model and labels; send labels in the runway response.

---

## WP 7 — Backend performance

**Dashboard net worth (highest value)**

- `/net-worth` (`dashboard.ts:724-770`, `lib/currencyRateSync.ts:133-157`) loads all history
  (every transaction, full price history, whole FX history) although only the current month is
  normally recomputed. Load snapshots first, compute only missing months, bound history to the
  window plus one "latest before window" row (`DISTINCT ON`).
- `buildRatesToBaseCurrencyAt` (`lib/currencyRateCache.ts:153-172`) regroups + re-sorts all FX
  history per month; `resolveHistoricalHoldingPrice` (`lib/netWorth.ts:159-161`) copies + sorts per
  holding per month. Sort once, binary-search.
- Current FX rates read from DB on every request (twice in `/net-worth`), and a stale table
  triggers a Yahoo sync inside the request with no single-flight. Add an in-memory cache refreshed
  by the scheduler with a shared promise.
- `/allocations` and `/net-worth` repeat ~9 queries per dashboard load — merge or share loaded data.

**Indexes & worker queries**

- Add `index(holding_id[, date])` on `holding_transactions` (`schema.ts:428`) and
  `index(pot_id[, date])` on `pension_transactions` (`schema.ts:559`) — FK cascades and filters scan.
- Pension import worker polls every 3 s with two unindexed queries (`pension-imports.ts:729-734,
1248-1257`). Add partial indexes on `status='queued'` / expiry, claim jobs with
  `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`.
- Expired import cleanup (`pension-imports.ts:1259-1270`) is 2N sequential round trips → one
  `UPDATE … RETURNING storage_key` + batched S3 deletes.

**Loops & serial awaits**

- `budget.ts:316-328 classifyBudgetCategories`: SELECT+UPDATE per item → bulk.
- `services/bunqBudgetSync.ts:340-450`: 5–7 round trips per payment → preload mappings/categories
  into Maps, bulk insert with `ON CONFLICT DO NOTHING RETURNING`, one grouped `spent` update.
- Holding price sync (`holdingPriceSyncScheduler.ts:51-53`, `holdingPriceSync.ts:271-285`) fetches
  per user → fetch unique symbols once, bulk upsert.
- Net-worth snapshot job (`netWorthSnapshotScheduler.ts:24-26`) re-reads FX + partner per user →
  fetch rates once, only users with assets, bounded concurrency.
- `plan.ts:309-324` two independent queries run serially → `Promise.all`; `plan.ts:434`
  `savings.find` per txn → `Map`.
- All schedulers run immediately on every API boot/replica (`BE/index.ts:106-112`) → skip if last run
  is recent (`worker_heartbeats`), leader lock, or move into the worker process.

---

## WP 8 — Frontend data layer

- **Central query keys + domain invalidation:** `invalidateQueries({ queryKey: ['dashboard'] })`
  appears 39× in 38 files; only investments, pension and salary centralize keys. Invalidation sets
  are inconsistent (e.g. `useCreateMortgageTransaction.ts:15` omits `['investments']`; savings txn
  hooks omit `['plan']`; `plan/components/CategoryClassificationCard.tsx` invalidates budget from a
  component). Add a `queryKeys.ts` factory + one dependency map applied via
  `invalidateDomain(qc, 'mortgage')` or a global `MutationCache.onSuccess` driven by `meta.domains`.
- **Narrow over-broad invalidation** (lands with the above): goal and budget-category mutations
  invalidate all of `['dashboard']` (refetching `/net-worth`, `/allocations`, `/transactions`);
  `investments/utils/query-invalidation.ts:4-8` invalidates everything investments + mortgages +
  dashboard; `useCreateMortgage.ts:17` invalidates all investments; `['savings']` also hits the
  static `banking-entities` list.
- **Collapse 53 one-call mutation hook files** (~1,170 lines) into one file per feature like
  `features/employment/hooks/index.ts`, or a `makeCrudHooks({ path, keys, normalize })` factory.
- **Typed API boundary:** 71 `data.data as T` casts. Export Hono `AppType` and use `hc<AppType>`, or
  a typed `apiGet<T>`/`apiPost<T>` in `lib/api.ts` that unwraps `{ data }`. Then delete no-op
  normalizers (8 identity functions, ~45 call sites: `investments/utils/normalizers.ts`,
  `mortgage/utils/mortgage-normalizers.ts`, `normalizeSavingsAccount`, `normalizeBudgetTransaction`,
  `normalizeSalaryHistory`) and slim `pension/utils/pension-api-normalizers.ts` (288 lines, invents
  timestamps via `toIsoStringOrNow`).
- **Duplicated types:** `MortgageTxnType`/`MORTGAGE_TXN_TYPES`, `PensionTxnType`, savings `TxnType`,
  `position.ts:3-4 HoldingTxnType/PropertyTxnType` duplicate `@quro/shared` unions;
  `ConvertToBaseFn`/`IsForeignFn` defined 3× (`investments/types.ts:20`, `pension/types.ts:29`,
  `savings/types.ts:6`) — derive once from `lib/CurrencyContext.tsx`.
- **API error message extraction:** 3 implementations (`debts/utils/forms.ts:25-40`,
  `landing/utils/auth-error.ts:9`, `lib/pdfDocuments.ts:56-68`) — move
  `readApiErrorMessage`/`resolveApiErrorMessage` to `lib/api.ts`.

---

## WP 9 — Frontend performance

- **Route-level code splitting:** `FE/routes.tsx:1-13` imports all 12 pages eagerly (recharts in the
  entry chunk, even on `/welcome`) → `lazy:` route option / `React.lazy`.
- **Emoji picker in entry chunk:** `EmojiPickerField.tsx:3` statically imports `emoji-picker-react`
  and is pulled in via the `@/components/ui` barrel from `lib/CurrencyContext.tsx:12` → dynamic
  import on open.
- **CurrencyContext identity:** `lib/CurrencyContext.tsx:183-218` recreates `convertToBase`,
  `fmtBase` and the value object every render; ~9 hooks use `convertToBase` as a memo dep →
  `useCallback`/`useMemo`.
- **Unmemoized heavy calcs:** `mortgage/MortgagePage.tsx:76 computeMortgageMetrics` (full
  amortization) every render; `DashboardPage.tsx:136-199` derived values; `investments/utils/position.ts:52-55`
  O(H·T log T) → group by holding once; `pension/utils/pension-calculations.ts:108-113` O(Y·P·T) →
  group by pot with running totals; `BrokerageTab.tsx:544-615` recomputes row metrics inside the
  sort comparator.
- **Over-fetching on dashboard:** `DashboardPage.tsx:87-91` downloads all holding transactions and
  all payslips for small aggregates → server-side aggregates or date-bounded requests.
- **Notification polling:** `NotificationBell.tsx:155` / `usePensionImportNotifications.ts:45`
  polls `/api/pensions/imports` every 15 s forever → poll only while a job is queued/processing.

---

## WP 10 — Frontend state & component simplification

- **Shared table sorting:** 5 implementations (`PayslipHistoryTable.tsx:190`,
  `debts/components/PaymentHistory.tsx:131`, `RecentTransactionsList.tsx:227`,
  `BrokerageTab.tsx:544-615,1171-1221`) → `sortValue(row)` on `DataTableColumn` + `useSortedRows`.
- **Pagination:** 3 copies (`PensionTxnHistory.tsx:86-107`, `savings/components/TxnHistory.tsx:21-41`,
  `RecentTransactionsList.tsx:235-250`) with a redundant clamp effect → `usePagination(items,
pageSize, resetKey)`.
- **Goal modal hooks:** ~60 identical lines in `useAddGoalModal.ts:44-120` / `useEditGoalModal.ts:67-146`
  → one `useGoalForm`; export `computeAllocationsContext` (superseded by WP 6 if the API returns
  net worth).
- **Derived state mirrored via effects:** `usePensionImportModalController.ts:138-161` (use `key`
  remount); `settings/SettingsPage.tsx:361,754` (key on `user`, `useMutation` for pending/error);
  `mortgage/hooks/useMortgagePageState.ts:47-51` (URL param as source of truth);
  `lib/pdfDocuments.ts:98-102` (derive or key).
- **Split oversized components:** `SettingsPage.tsx` (1,286 lines) → one file per section;
  `ImportPensionStatementModal.tsx` (1,471 lines) → one file per step, inline `cn()` instead of
  single-ternary class helpers (~316-650), pass `controller` instead of ~20 props (`:1360`).
- **Txn meta tables:** `PROPERTY_TXN_META` duplicated in `AddPropertyTxnModal.tsx:26` /
  `PropertyTxnHistory.tsx:17`; `TXN_META` in `AddHoldingTxnModal.tsx:35` / `HoldingTxnHistory.tsx:19`;
  per-type if-chains at `AddPropertyTxnModal.tsx:266-326` → one `investments/constants.ts` like
  pension/savings/mortgage.
- **Import status → phase mapping** duplicated (`notification-utils.ts:11-18`,
  `usePensionImportModalController.ts:130`) → one `Record<PensionImportStatus, JobPhase>`.

---

## WP 11 — UI consistency & design tokens

- **Mortgage txn modal:** `AddMortgageTxnModal.tsx` re-implements `TxnTypeSelector` (shadows the
  shared one), `DateNoteRow`, `CurrencyInput` and `FormField` → use the shared molecules like the
  other txn modals.
- **Raw field styling:** `AddMortgageModal.tsx` (11 inputs, 12 labels), `EditCategoryDialog.tsx:85,94`,
  `RecentTransactionsList.tsx:109`, `EditHoldingModal.tsx:190,256`, `PensionModal.tsx:256`,
  `ImportPensionStatementModal.tsx:699,747` → `TextInput`/`SelectInput`/`Textarea`/`DateInput`
  inside `FormField`, or `getFieldChrome({ paddingClassName })` for compact cells.
- **Delete buttons:** 5 hand-rolled rose `Trash2` buttons (`AddPayslipModal.tsx:305`,
  `AddMortgageModal.tsx:478`, `AccountModal.tsx:298`, `EditHoldingModal.tsx:401`,
  `UpdatePropertyModal.tsx:129`) → `Button variant="danger"` / `IconButton` or a `ModalDeleteButton`.
- **Custom modal shell:** `ImportPensionStatementModal.tsx:1454-1470` bypasses `Modal` (loses
  Escape, focus trap, `aria-modal`) → add a wider size to `Modal`'s `MAX_WIDTH_MAP` and use it.
- **Stat cards:** `savings/components/SavingsStats.tsx:19-86` hand-builds cards → `StatsGrid`/`StatCard`.
- **Number formatting in shared organism:** `ArchiveOrDeleteDialog.tsx:43-53` uses
  `Intl.NumberFormat(undefined, …)`, ignoring the user's number-format preference → `fmtNative`
  or pass a formatter.
- **Raw palette classes:** 1,857 raw Tailwind palette classes in 96 files (e.g.
  `SavingsStats.tsx:69 text-slate-900`) plus hex colours in `goals-constants.ts` and
  `EditCategoryDialog.tsx` — migrate feature-by-feature to semantic tokens and add a lint rule
  to prevent regressions.

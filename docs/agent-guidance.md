# Agent guidance and repository skill evaluation

Owner: **Pieter O'Hearn**. Evaluated 4 October 2026 for
[issue #268](https://github.com/Pieter-OHearn/quro/issues/268), starting from M1
commit `0699c2c` (v0.7.0). This change updates documentation and instructions;
it does not implement recurring payments or expand household/recovery product scope.

## Entry point, precedence and maintenance

[Root AGENTS.md](../AGENTS.md) is the sole repository agent entry point. The former
`CLAUDE.md` is removed. System/developer instructions and the user's task take
precedence; applicable deeper AGENTS.md files refine root guidance. A selected
skill adds workflow details within those constraints. Reference docs and examples
neither override the task nor authorize live operations.

Repository skills live in `.agents/skills/`, which Codex discovers from the working
directory through the repository root. Keep root instructions short and use skills
only for the corresponding task; they require no installation, connector, API key
or additional package. Other agents can read the same Markdown explicitly.

OpenAI Docs sources used for this structure:
[AGENTS discovery and layering](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[skill discovery and description-based matching](https://learn.chatgpt.com/docs/build-skills),
and [evaluating skills with captured tasks and checks](https://developers.openai.com/blog/eval-skills).
The skill bodies are Quro-specific source guidance rather than copies of those docs.

Contributors update affected instructions in the same PR as script, runtime, schema,
auth, household, query or UI changes. The owner reviews those updates and the
retention decision. Re-run the relevant trial when a referenced behavior changes;
remove a skill if its useful routing has moved into root guidance or it no longer
helps. Use manifests, scripts and current code to resolve drift, and record runtime
gaps instead of treating source review as proof. Broader contributor/release
workflow documentation is R02's scope.

Known integration conflict: M6 [#310](https://github.com/Pieter-OHearn/quro/issues/310)
still names the retired file. Leave that ticket unchanged and preserve AGENTS-only
guidance at the final merged-tree gate
[#359](https://github.com/Pieter-OHearn/quro/issues/359).

## Skills and trigger trials

| Skill                                                                         | Representative task that should select it                                            | Task that should not select it                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [quro-vertical-feature](../.agents/skills/quro-vertical-feature/SKILL.md)     | User-owned recurring-payment API, shared contract and frontend page/hooks            | Frontend-only token styling; database restore only           |
| [quro-migration-recovery](../.agents/skills/quro-migration-recovery/SKILL.md) | Upgrade ambiguous legacy budget rows and plan synthetic PDF recovery                 | Ordinary CRUD without schema work; frontend-only changes     |
| [quro-ui-implementation](../.agents/skills/quro-ui-implementation/SKILL.md)   | Responsive pension activity screen, empty/submitting states and saved color swatches | Backend-only ownership validation; Python documentation typo |

All three description reviews selected their positive case and excluded their
negative cases. This is manual trigger assessment plus explicit skill invocation,
not a measured test of automatic selection in every host.

## Representative comparisons

Each task first ran with root instructions and source inspection, excluding skills.
Feature and recovery evaluators then read their skill and revisited the same task;
the UI skill trial used a fresh evaluator without baseline reports. Evaluators
were read-only, ran existing synthetic DB-free tests and did not call live providers
or databases. Their task was to produce an implementation/rehearsal plan, not ship
another feature. The author separately runs the disposable DB verification below.

Prompts preserved for repeat evaluation:

- **Feature:** Prepare a concrete plan for a new user-owned recurring-payment
  resource with amount, currency, calendar due date and optional notes, backend
  CRUD and frontend hooks/page. Identify current reuse paths, ownership/validation
  cases and cache decisions; run relevant existing DB-free synthetic tests.
- **Recovery:** Prepare a safe rehearsal for upgrading ambiguous legacy foreign
  budgets and recovering synthetic pension documents after DB restore. Include
  current entry points, target prerequisites, recovery coverage, failure scenarios
  and exact commands for disposable resources. Run DB-free tests only.
- **UI:** Prepare an implementation/QA plan for pension transaction history with
  mobile layout, numeric values, empty state, submitting button and saved category
  swatches. Choose current reuse paths, tokens, state ownership and checks; run
  relevant existing DB-free synthetic tests.

For each repeat, compare a root-only pass against root plus the selected skill;
record paths, commands/results and the resulting plan. Judge current source reuse,
domain/ownership correctness, safe resource selection, relevant verification and
explicit limitations. Do not give the evaluator an expected plan or suspected bug.
Use an isolated fixed snapshot for a stronger future comparison.

| Trial    | Root instructions alone: observed output                                                                                                                                      | Skill-assisted output and retention decision                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature  | Correct owner-only CRUD and narrow cache plan; guessed several nonexistent app/auth/helper paths before locating actual files; spotted a draft numeric-guidance contradiction | Direct Goals/access/validation routing and integration-cleanup warning; same core plan without those guesses. **Retain** for concrete source and test navigation                                                                  |
| Recovery | Correctly found schema-initialized restore requirement, conditional grants and separate PDF backup after broad source inspection                                              | Collected those prerequisites directly; also exposed path ambiguity and missing worker-state/SQL-atomicity guidance in the skill. **Retain after fixes** for its recovery checklist                                               |
| UI       | Correct feed-versus-table, native currency, saved-color and component choices; 32 shared UI plus 30 focused tests passed                                                      | Fresh evaluator made compatible choices, exercised all 156 frontend tests plus 32 focused smoke cases, and explicitly separated static markup from browser proof. **Retain** for the component/QA route and saved-color exception |

These small trials show usable workflows, not a causal quality or speed benchmark.
Feature/recovery reuse prior context, the root numeric text was corrected between
passes, and early evaluator source observations were inconsistent before re-reading
current files. No exact reduction in tool calls or model-error rate is claimed.
All baseline plans already recognized the major domain constraints. Retention is
based on useful focused navigation/checklists and compatible outcomes, not invented
baseline failures.

## Concrete corrections and simplification

- The baseline found draft guidance saying Drizzle money stays string-valued;
  current schema uses `numericAsNumber` and public JSON numbers. Corrected root and
  feature examples; this is a root correction, not a skill-caused improvement.
- Feature trials verified rejection of client ownership fields, domain-specific
  invalidation, current shared exports and meaningful frontend tests. Corrected
  tutorial examples, including the actual `EmptyState` props and `bunq` capability.
- Recovery trial found ambiguous abbreviated paths; made source paths explicit.
  Added the need to reconcile restored import states/expiry before worker restart
  and distinguish atomic custom dumps from non-atomic plain SQL restore.
- UI trial preserved persisted hex color identity while using semantic presentation
  tokens, reused the built-in loading button and kept Figma conditional. Removed
  an unconditional Figma-first flow from always-loaded root instructions.
- Removed blanket dashboard invalidation, generic lint-rule catalogs, copied setup
  recipes and repeated routing/envelope instructions. Kept the root package map,
  invariants and exact command table; each skill remains a single focused file.

Existing UI/date/focus gaps identified in the representative plans are pre-existing
product work, not findings introduced by this documentation change. No claim is
made that the sample screen now has browser or mobile verification.

## Verification evidence

Evaluation commands and actual results (root unless indicated):

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Result                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=test bun test packages/backend/src/lib/requestValidation.test.ts packages/backend/src/db/driverNumeric.test.ts packages/shared/test/utilities.test.ts`                                                                                                                                                                                                                                                                                           | 32 passed                                                                                                                          |
| `NODE_ENV=test bun test packages/frontend/src/lib/queryInvalidation.test.ts packages/frontend/src/lib/api.test.ts packages/frontend/src/lib/routeQueryErrors.test.ts`                                                                                                                                                                                                                                                                                      | 21 passed                                                                                                                          |
| `NODE_ENV=test bun run --filter '@quro/frontend' test:ui`                                                                                                                                                                                                                                                                                                                                                                                                  | 32 passed, 107 assertions                                                                                                          |
| `bun test packages/frontend/src/lib/dataColors.test.ts packages/frontend/src/features/pension/utils/pension-api-normalizers.test.ts packages/frontend/src/features/pension/utils/pension-calculations.test.ts packages/frontend/src/hooks/usePagination.test.tsx packages/frontend/src/hooks/useSortedRows.test.ts packages/frontend/src/lib/queryInvalidation.test.ts packages/shared/test/formatCurrency.test.ts packages/shared/test/utilities.test.ts` | 30 passed                                                                                                                          |
| `bun run test:ui`                                                                                                                                                                                                                                                                                                                                                                                                                                          | 156 passed                                                                                                                         |
| `NODE_ENV=test bun test packages/backend/src/lib/currencyRateCache.test.ts packages/backend/src/lib/pdfDocuments.test.ts packages/backend/src/lib/s3Deletes.test.ts packages/backend/src/lib/pensionTransactionValidation.test.ts packages/backend/src/lib/pensionTransactions.test.ts`                                                                                                                                                                    | 21 passed                                                                                                                          |
| `NODE_ENV=test DATABASE_URL= ADMIN_DATABASE_URL= APP_DATABASE_URL= BOOTSTRAP_DATABASE_URL= bun test packages/backend/src/db/config.test.ts`                                                                                                                                                                                                                                                                                                                | 5 passed; initial combined run failed one case because an explicit admin URL overrode the test's shared URL; isolated rerun passed |
| Skill creator `scripts/quick_validate.py` on each final skill                                                                                                                                                                                                                                                                                                                                                                                              | All three valid; validator run in a temporary Python environment with PyYAML                                                       |

The owner checkout's `check:bun-version` fails on an unrelated untracked planning
file mentioning an old runtime pin. That file is preserved and excluded from this
PR. A clean temporary source snapshot plus this change is used for author
verification, with existing dependency directories and a disposable PostgreSQL 16
container on port 55468, no owner data mounts and a temporary RAM-backed database.
Explicit role URLs are unset in that snapshot (which has no package `.env` files),
so its single explicit `DATABASE_URL` selects the isolated target for both roles
and lets the config tests exercise URL precedence independently.

Author verification results:

| Check                                                                                                  | Actual result                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run ci:check` in the clean snapshot with the isolated `DATABASE_URL`                              | Runtime pin, format, lint (existing warnings), typecheck and migrations passed; shared/script tests 37 passed; backend 395 passed and 1 failed, so the command exited 1                                                                            |
| Isolated `NODE_ENV=test bun test src/routes/bunq.integration.test.ts` from snapshot `packages/backend` | 12 passed; confirms the Bunq cases pass without the pension suite's global capability mock                                                                                                                                                         |
| `NODE_ENV=test bun run test:ui` in snapshot                                                            | 156 passed                                                                                                                                                                                                                                         |
| `bun run build` in snapshot                                                                            | Frontend and backend passed                                                                                                                                                                                                                        |
| `bun run check:python:format`, `check:python:lint`, `check:python:build`                               | Passed with existing `.venv/bin` tools on PATH                                                                                                                                                                                                     |
| `bun run check:security:js`, `check:security:python`                                                   | Passed; no known vulnerabilities reported                                                                                                                                                                                                          |
| Changed-document relative links, explicit skill paths and root script names                            | Exist; checked against current files/manifests                                                                                                                                                                                                     |
| Synthetic custom-dump backup/restore and failure probes                                                | Passed on separate `q268_source`/`q268_restore` databases: one synthetic demo user restored, runtime grants reapplied, omitted confirmation and nonempty target refused, corrupt dump refused after pre-restore backup and original rows preserved |

The backend aggregate failure is pre-existing: the global capability mock in
`packages/backend/src/routes/pension-imports.integration.test.ts` returns only AI
and pension status, so the later Bunq test receives no `bunq` status. Neither test
nor application source is changed by this PR. Full CI is **not green**; the
isolated pass does not erase that aggregate failure. Test-mock isolation remains
outside this documentation ticket.

The recovery replay used the skill's exact root migration, role bootstrap,
`db:backup -- --output` and `db:restore -- <path>` commands. Temporary
`QRO_PG_DUMP_BIN`/`QRO_PG_RESTORE_BIN` forwarding wrappers ran PostgreSQL 16 client
tools inside the disposable container because host client tools were unavailable.
It exercised a current-schema custom dump, not an old-release full upgrade or PDF
object-store recovery. Existing temporary-table budget and partner migration tests
passed during the backend run. Browser/visual QA was not run for this documentation
change; static UI tests remain the only UI runtime evidence.

Initial snapshot attempts needed per-package dependency links and reformatting of
one changed guide before CI could reach the tests; those setup problems were
resolved. The disposable database container is removed after verification. No
owner resources or untracked planning files are changed.

## Acceptance-to-evidence map

| Issue criterion                                              | Evidence                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Short root guidance with map, commands and invariants        | [AGENTS.md](../AGENTS.md), verified against manifests, guards, numeric/date/FX and partner helpers                                    |
| Migrate useful old instructions and correct EV06             | Removed old entry point; updated development, feature and UI verification guides plus [documentation review](documentation-review.md) |
| Start three actual-code skills                               | Three linked single-file skills, validated frontmatter and current source paths                                                       |
| Evaluate against instructions alone and retain useful skills | Representative prompts, comparison outputs, trigger cases, retention decisions and limitations above                                  |
| Precedence and maintenance owner                             | Root and this record; owner and same-PR update expectations stated                                                                    |

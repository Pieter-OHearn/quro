# Agent guidance and repository skills

Owner: **Pieter O'Hearn**. Skills were first evaluated on 4 October 2026 for
[issue #268](https://github.com/Pieter-OHearn/quro/issues/268); the PR for that
issue records the command results.

## Entry point and maintenance

[Root AGENTS.md](../AGENTS.md) is the sole repository agent entry point and states
instruction precedence. It routes feature and UI work to the contributor docs that
humans use. Repository skills are plain Markdown files with `name`/`description`
frontmatter in `.agents/skills/`. Agents that discover skills can select one by its
description; any other agent can read the file directly. They need no installation,
connector, API key or additional package.

A skill stays only while it holds a task workflow that is not already in the
contributor or user docs and is too specific for AGENTS.md. If a doc covers the same
ground, improve the doc and remove the skill. The current skill is a stopgap until
the backup and restore steps are published as user-facing documentation.

Contributors update affected instructions in the same PR as script, runtime, schema,
auth, household, query or UI changes. The owner reviews those updates and the
retention decision. Re-run the relevant trial when a referenced behavior changes.
Use manifests, scripts and current code to resolve drift, and record runtime gaps
instead of treating source review as proof.

## Skill and trigger trial

| Skill                                                                         | Representative task that should select it                            | Task that should not select it                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| [quro-migration-recovery](../.agents/skills/quro-migration-recovery/SKILL.md) | Upgrade ambiguous legacy budget rows and plan synthetic PDF recovery | Ordinary CRUD without schema work; frontend-only changes |

The description review selected the positive case and excluded the negative cases.
This is manual trigger assessment plus explicit skill invocation, not a measured
test of automatic selection in every host.

## Representative comparisons

Each task first ran with root instructions and source inspection, excluding skills.
Feature and recovery evaluators then read their skill and revisited the same task;
the UI skill trial used a fresh evaluator without baseline reports. Evaluators
were read-only, ran existing synthetic DB-free tests and did not call live providers
or databases. Their task was to produce an implementation/rehearsal plan, not ship
another feature.

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

For each repeat, compare a root-only pass against root plus the selected skill or
doc; record paths, commands/results and the resulting plan. Judge current source
reuse, domain/ownership correctness, safe resource selection, relevant verification
and explicit limitations. Do not give the evaluator an expected plan or suspected
bug. Use an isolated fixed snapshot for a stronger future comparison.

| Trial    | Root instructions alone: observed output                                                                                                                                      | Skill-assisted output                                                                                                                                 | Decision                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature  | Correct owner-only CRUD and narrow cache plan; guessed several nonexistent app/auth/helper paths before locating actual files; spotted a draft numeric-guidance contradiction | Direct Goals/access/validation routing and integration-cleanup warning; same core plan without those guesses                                          | **Folded** into the reference implementation section of [adding a feature](adding-a-feature.md); the gain was source navigation, which a doc provides                  |
| Recovery | Correctly found schema-initialized restore requirement, conditional grants and separate PDF backup after broad source inspection                                              | Collected those prerequisites directly; also exposed path ambiguity and missing worker-state/SQL-atomicity guidance, since fixed in the skill         | **Retain** until a user-facing backup and restore page covers the rehearsal steps                                                                                      |
| UI       | Correct feed-versus-table, native currency, saved-color and component choices; 32 shared UI plus 30 focused tests passed                                                      | Fresh evaluator made compatible choices, exercised all 156 frontend tests plus 32 focused smoke cases, and separated static markup from browser proof | **Folded** into [design tokens](design-tokens.md) and [shared UI verification](shared-ui-verification.md); the baseline already made the right choices from those docs |

These small trials show usable workflows, not a causal quality or speed benchmark.
Feature and recovery passes reused prior evaluator context and the root numeric text
was corrected between passes, so no reduction in tool calls or error rate is
claimed. All baseline plans already recognized the major domain constraints.

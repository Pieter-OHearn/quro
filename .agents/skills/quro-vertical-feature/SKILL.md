---
name: quro-vertical-feature
description: Deliver a Quro feature spanning shared API contracts, backend routes and frontend hooks or pages. Use for cross-layer behavior changes, not isolated copy or styling edits.
---

# Vertical feature delivery

Use the root AGENTS.md invariants. Follow the existing feature nearest the requested
behavior; the recurring-payments tutorial is illustrative, not an implemented module.

- Trace the contract through `packages/shared/src/types/index.ts` or `types/payloads.ts`
  and `packages/shared/src/index.ts`, backend schema/routes and frontend feature hooks. For validation
  and owned CRUD, inspect `packages/backend/src/routes/goals.ts`,
  `packages/backend/src/lib/requestValidation.ts` and `packages/backend/src/lib/access.ts`. Joint resources instead
  need `packages/backend/src/lib/partner.ts` and the relevant parent/transaction route.
- Validate referenced records and PATCH merged state, not just incoming fields;
  Goals demonstrates both checks. The root auth/ownership rules still apply.
- Frontend queries use `packages/frontend/src/lib/queryKeys.ts` and typed API helpers
  in `packages/frontend/src/lib/api.ts`. Mutations use `packages/frontend/src/lib/useDomainMutation.ts`; declare affected
  caches in `packages/frontend/src/lib/queryInvalidation.ts`. For example, goals invalidate only goals;
  savings also refreshes dashboard and plan. Add dependencies for a new domain based
  on actual readers, rather than copying an old blanket invalidation list.
- Keep feature forms/components/hooks under `packages/frontend/src/features/<feature>/`; shared UI
  stays presentation-only. Optional infrastructure uses the existing capability
  status contract and a disabled default; ordinary CRUD needs no capability flag.

Choose verification by changed behavior:

- Validation, money/date/FX or attribution: co-located Bun tests and shared utilities.
- Auth, ownership, referenced parents or CRUD: route integration tests using
  `packages/backend/src/test/integration.ts` with a distinct synthetic email domain;
  cleanup deletes matching users, so it still requires a disposable database.
- Cache updates: `packages/frontend/src/lib/queryInvalidation.test.ts`; verify both
  affected queries and unrelated caches. UI: the relevant shared or feature tests.

Focused examples (root):

```sh
NODE_ENV=test bun test packages/backend/src/lib/requestValidation.test.ts packages/backend/src/routes/goals.test.ts
bun run --filter '@quro/frontend' test src/lib/queryInvalidation.test.ts
```

For schema work, use the migration/recovery skill. Finish with the applicable root
checks and describe the synthetic scenarios and any runtime gaps in the PR.

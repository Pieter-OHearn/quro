# Documentation review

Rechecked 4 October 2026 against the M1 starting commit `0699c2c` (v0.7.0),
then updated for issue [#268](https://github.com/Pieter-OHearn/quro/issues/268).
This replaces the stale v0.0.1 review; it is a source audit, not runtime proof.

## Verified facts and corrections (EV06)

| Topic              | Current source and guidance                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent instructions | Root [AGENTS.md](../AGENTS.md); the old vendor-specific entry point is removed                                                                                                                |
| Runtime            | `.bun-version` pins 1.4.2; `bun run check:bun-version` checks Dockerfiles and docs                                                                                                            |
| Tests              | Root `test` runs shared/script, backend and frontend Bun tests; root `test:ui` runs all frontend tests; package `test:ui` isolates shared UI static markup; root `test:smoke` runs Playwright |
| Numeric contract   | Schema `numericAsNumber` maps PostgreSQL strings to finite numbers; public JSON stays numeric and preserves nulls                                                                             |
| API protection     | Global auth/CSRF middleware with exact public paths in `packages/backend/src/lib/publicPaths.ts`                                                                                              |
| Client cache       | Central `queryKeys`, `useDomainMutation` and `queryInvalidation`; no blanket dashboard invalidation requirement                                                                               |
| Optional services  | Core Bun/PostgreSQL app remains usable without bank linking or the pension parser/worker/AI stack                                                                                             |

Framework versions are not repeated here; package manifests and the lockfile are
authoritative. The old review referenced missing database-safety and webhook
documents. Current maintained references are [development](development.md),
[architecture](architecture.md), [security](security.md),
[device auto-update](device-auto-update.md), [household policy](household-model.md),
[feature delivery](adding-a-feature.md), [design tokens](design-tokens.md) and
[shared UI verification](shared-ui-verification.md).

## Scope and remaining work

Issue #268 corrects the agent entry point, commands/framework facts, feature-guide
examples and the repository skill. The [evaluation record](agent-guidance.md)
holds skill triggers and retention trials; the issue's PR maps acceptance criteria to
evidence. It does not certify operator installation, full object-store recovery or release
qualification. Broader contributor/release documentation belongs to R02; current
release workflow claims still need that separate audit.

The M6 ticket [#310](https://github.com/Pieter-OHearn/quro/issues/310) still names
the former root instruction file. Preserve the AGENTS-only direction when
integrating it; the final merged-tree gate is [#359](https://github.com/Pieter-OHearn/quro/issues/359).
Those tickets are unchanged by this documentation migration.

---
name: quro-ui-implementation
description: Implement or review Quro frontend screens and shared UI with repository tokens, component reuse and UI QA. Use for visual or interaction changes, not backend-only work.
---

# UI implementation and QA

Inspect the owning feature and `packages/frontend/src/components/ui/index.ts`
before choosing components. Read `docs/design-tokens.md` for a changed visual pattern,
then the relevant primitives and `packages/frontend/src/styles/theme.css`; avoid loading every UI file.

- Shared atoms/molecules/organisms own reusable chrome; feature directories own
  data, permissions and business logic. Native wrappers pass through HTML props,
  accept `className` and merge with `cn`. Use existing variants/sizes, Lucide icons,
  `getFieldChrome` for field styling and `font-numeric` for aligned financial values.
- Use `DataTable` for comparable columns, `TxnHistoryPanel`/`TxnRow` for activity
  feeds and card grids for independent objects. Configure table numeric alignment,
  mobile labels and column priorities instead of styling each cell ad hoc.
- Semantic tokens cover surfaces, foreground, borders, status, motion and radius.
  Persisted feature `DATA_COLORS` are an exception: preserve their identities and use
  `dataColorToken()` for preset swatches. Do not rewrite saved colors as theme tokens.
- Preserve loading, empty/error, disabled and submitting states, labels, keyboard
  controls and focus behavior. `Button` already supports loading and disables itself;
  use this before inventing a second submit-button pattern.
- If the user supplies a Figma reference and the integration is available, obtain
  design context and a screenshot for the same node, re-fetch truncated context via
  metadata, then use returned assets and compare the implemented UI with that image.
  If unavailable, report the gap; ordinary UI work does not require Figma.

Verification (root):

```sh
bun run test:ui
bun run --filter '@quro/frontend' test:ui
```

The first runs all frontend Bun tests; the second isolates shared static-markup smoke
cases in `packages/frontend/src/components/ui/shared-ui.smoke.test.tsx`. Add cases for meaningful new
shared behavior. Static rendering is not browser interaction or visual proof.
Use `docs/shared-ui-verification.md` for affected-route manual checks, including
file/emoji inputs; use `bun run test:smoke` for Playwright only with an isolated
migrated DB (it seeds demo data). Check narrow/wide layouts and keyboard interaction
when relevant, and report which checks actually ran. Use the root format/lint,
typecheck and build checks before the PR.

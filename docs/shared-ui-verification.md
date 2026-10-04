# Shared UI Verification

Lightweight verification path for shared frontend atoms and molecules under `packages/frontend/src/components/ui`.

## Automated smoke coverage

- Run `bun run --filter '@quro/frontend' test:ui` from the repo root for shared UI
  smoke cases only; `bun run test:ui` runs all frontend Bun tests.
- Playwright is `bun run test:smoke`; it migrates and seeds the selected isolated
  database and is a separate browser check.
- The suite lives at `packages/frontend/src/components/ui/shared-ui.smoke.test.tsx`.
- It uses `bun:test` plus `react-dom/server` `renderToStaticMarkup` and asserts stable text, ARIA attributes, and key markup markers.
- New shared atoms and molecules should add at least one smoke case before merge.
- `EmojiPickerField` and `PdfAttachmentField` stay manual-only for now because they need richer DOM and file-input coverage than this ticket adds.

## Manual checklist

Use a disposable synthetic local instance with frontend and backend running; for
authenticated routes, use the synthetic demo user. Do not seed the owner's instance.

- `/welcome`: open `Sign in`, verify shared dialog chrome, labeled fields, password toggle button, primary submit button, and secondary actions still render correctly.
- `/welcome`: switch to `Sign up`, verify the shared field and button styling still matches the current landing auth flow and the close button still dismisses the modal.
- `/salary`: verify the year segmented control, shared table/header shell, and row action controls render without spacing or alignment regressions.
- `/savings` or `/pension`: verify transaction history filters and pagination controls still render correctly and page changes do not break layout.
- If the change touches `EmptyState`: verify an empty-state route in a disposable local state, preferably `/mortgage` with no mortgage data or a `/goals` filter/year combination with no matching items, and confirm title, description, icon, and CTA layout.
- If the change touches `LoadingState`: trigger a visible loading pass on `/salary`, `/goals`, or `/budget` by refreshing during a slow/local restart and confirm the shared loading shell still appears centered.
- If the change touches `EmojiPickerField` or `PdfAttachmentField`: manually verify the owning feature flow because those components are not covered by the smoke suite.

## PR expectation

- UI refactor PRs should include the `bun run test:ui` result when shared atoms or molecules are touched.
- PRs should also list the relevant manual checklist items that were exercised.

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
- `EmojiPickerField` and `PdfAttachmentField` stay manual-only for now because they need richer DOM and file-input coverage than the static smoke suite provides.

## Expected sizes

Check these with the browser's element inspector at 1440px and at 390px wide. A control that is
taller or shorter than its row is a regression. The values come from [V1 design](design-v1.md#4-density).

| Element                        | Laptop (1024px and wider)        | Phone (below 640px)                        |
| ------------------------------ | -------------------------------- | ------------------------------------------ |
| Table row                      | 28px (36px with a second line)   | Card rows, each line at least 48px         |
| `Button`, fields, `IconButton` | 32px (28px for `sm` in toolbars) | At least 44px; `xl` buttons 48px           |
| Text in a field (`text-field`) | 13px                             | 16px, so iOS Safari does not zoom on focus |
| `SegmentedControl`             | 28px                             | 44px options sharing the width             |
| `Pagination` page button       | 28px square                      | 44px square                                |
| Card header (`PanelHeader`)    | 36px                             | 44px                                       |
| Sidebar item                   | 32px                             | 44px, in the drawer                        |
| Header / tab bar               | 48px / not shown                 | 56px / 60px tabs above the safe area       |
| Card padding                   | 16px                             | 16px                                       |

Every interactive element is at least 44px high on a phone, including icon buttons, table row
actions, dialog close buttons and tab bar tabs. Look at each change in the light and dark theme
(Settings → Preferences → Appearance, or the operating system setting with System selected); a
colour that is only right in one of them is a bug.

## Manual checklist

Use a disposable synthetic local instance with frontend and backend running; for
authenticated routes, use the synthetic demo user. Do not seed the owner's instance.

- `/welcome`: open `Sign in`, verify shared dialog chrome, labeled fields, password toggle button, primary submit button, and secondary actions still render correctly.
- `/welcome`: switch to `Sign up`, verify the shared field and button styling still matches the current landing auth flow and the close button still dismisses the modal.
- `/salary`: verify the year segmented control, shared table/header shell, and row action controls render without spacing or alignment regressions.
- `/salary`: the **Compare with** select keeps its arrow 12px from the right edge and a long option is cut before it, and the month cell (name over date) and the Investments asset cell have room above and below; select a payslip with the keyboard (Enter on a focused row) and with a tap at 390px; check the pay breakdown lines and the **Compare with** change column, that the year total row adds up the visible columns, that each phone card shows the month and currency, Net pay on the right and Gross, Bonus, Tax and Pension as a label over a value, with Download and Edit as 44px buttons, and that **Delete** is still in **Edit payslip**.
- `/investments`: open a holding in a foreign currency; check the **Position** panel shows both currencies, the rate note and the price source, that **Correct holding** opens the edit dialog (with **Remove holding**), and that at 390px each holding is a card (name over its caption line, Value with the gain under it, Units and Price as a label over a value, Edit and **View transactions** buttons, and **Show details** revealing Avg cost) without sideways scrolling at 320px; check a gain, a loss, the GBP holding and a long name in both themes.
- Tables with more than 25 rows (payslips, holdings): check the pager sorts the whole list first, resets to page 1 when the sort changes, and that totals still cover every row.
- `/savings` or `/pension`: verify transaction history filters and pagination controls still render correctly and page changes do not break layout.
- Charts (`ChartCard`, `AreaChartCard`, the allocation card): at 320px, 390px and 1280px and at 200% zoom, check nothing scrolls sideways, axis labels do not touch, the legend wraps, and the tooltip stays on screen. Tab to the chart, press the arrow keys and read the tooltip, then open **Show values** and compare it with the plotted points: a gap says "No value" (never 0), a negative keeps its minus sign and an estimated entry is marked in the Status column. Check two series that share a hue differ by dash, fill or outline, and that animation stops with reduced motion emulated.
- If the change touches `EmptyState`: verify an empty-state route in a disposable local state, preferably `/mortgage` with no mortgage data or a `/goals` filter/year combination with no matching items, and confirm the left-aligned dashed box with its title, description, small icon and at most one button.
- If the change touches `LoadingState`: trigger a visible loading pass on `/salary`, `/goals`, or `/budget` by refreshing during a slow/local restart and confirm the shared loading shell still appears centered.
- If the change touches `Modal`: on desktop confirm the dialog fades in on the scrim without blur; at 390px confirm it is a bottom sheet that rises from the bottom edge and leaves the same way, and that it only fades with reduced motion emulated. Static markup cannot show the transition. Also confirm Escape closes the dialog and returns focus to the control that opened it, and that focusing a field in the sheet does not shift the overlay. For a long form, submit it empty at 390px and confirm the first field with an error scrolls clear of the sticky actions and takes focus; with a real phone or simulator keyboard open, confirm the actions stay visible above it (an emulated viewport has no keyboard).
- If the change touches `FormField`: confirm an error appears with `role="alert"` and that a field being typed in keeps focus when another field gains an error.
- If the change touches `EmojiPickerField` or `PdfAttachmentField`: manually verify the owning feature flow because those components are not covered by the smoke suite.

## PR expectation

- UI refactor PRs should include the `bun run test:ui` result when shared atoms or molecules are touched.
- PRs should also list the relevant manual checklist items that were exercised,
  including narrow and wide layouts and keyboard use when relevant.
- Static markup tests do not prove browser interaction or visual layout; say which
  checks actually ran.

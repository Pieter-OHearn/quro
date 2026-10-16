# Design tokens

This page is how the V1 design is written in code: the CSS variables in
[`packages/frontend/src/styles/theme.css`](../packages/frontend/src/styles/theme.css), the Tailwind
utilities they feed, the shared components that use them, and the rules for using all of it. The
design itself (principles, every colour with its reason, type, density, shape, motion, content rules
and the logo) is specified in [V1 design](design-v1.md). Read that page for what the design is and
this one for how to build with it.

| Source                                                  | What it holds                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [V1 design](design-v1.md)                               | The values and the reasons for them. Code implements them and does not round or rename them                               |
| `packages/frontend/src/styles/theme.css`                | Every token, light and dark, the Tailwind mapping, the type utilities and the element defaults                            |
| `packages/frontend/src/styles/theme.test.ts`            | Fails when a dark value, a shadow or a duration differs from the V1 design page, or a colour token differs from this page |
| `packages/frontend/src/lib/utils.ts`                    | `cn()` and `TYPE_SCALE_UTILITIES`, which lets class merging keep a type style next to a colour class                      |
| `packages/frontend/src/components/ui/`                  | Shared atoms, molecules, organisms and page templates, exported from `index.ts`                                           |
| `packages/frontend/src/components/layout/`              | The shell: sidebar, header, phone tab bar                                                                                 |
| `packages/frontend/src/components/finance/`             | Display helpers shared by finance pages                                                                                   |
| `scripts/eslint/no-raw-palette.mjs`, `no-monospace.mjs` | The `quro-ui/no-raw-palette` and `quro-ui/no-monospace` lint rules                                                        |

## Rules

1. **Tokens, never values.** Style with the semantic utilities in this page (`bg-brand`,
   `text-fg-muted`, `border-border-subtle`). `quro-ui/no-raw-palette` rejects raw Tailwind palette
   colours, `white`, `black` and hex values in class strings, including variants and opacity
   modifiers. Need a colour that is not covered? Add a token to `theme.css` first
   ([Adding a token](#adding-a-token)), then use it.
2. **Dark mode is always supported.** Every colour is a token and every literal token has a dark
   value, so a component that uses tokens works in both themes without `dark:` variants. Never
   hard-code a colour, and look at a change in both themes before you ship it.
3. **Two sizes only.** Quro 1.0 is designed for a laptop (1024px and wider) and a phone (below
   640px). Widths in between get no dedicated layout: the shell keeps its drawer behind the header
   menu button, and a table switches to card rows below 768px. There is no tablet layout.
4. **Dense on a laptop, 44px on a phone.** Rows are 28px, controls 32px and card padding 16px; below
   640px every interactive element is at least 44px high and field text is 16px
   ([density](#density-and-shape)).
5. **One typeface, no monospace.** Geist only. `quro-ui/no-monospace` rejects `font-mono` and
   arbitrary monospace families. Align numbers with `font-numeric`.
6. **Labels are sentence case.** "Add transaction", not "Add Transaction". No uppercase transforms and
   no letter-spaced labels. Buttons name the action and its object, and a view has one filled button.
7. **No shadows on cards.** Structure comes from 1px borders and alignment. Only popovers (menus,
   tooltips) and dialogs cast a shadow.
8. **Selection is a tint, a fill is an action.** The current nav item, row, segment or page is a
   `brand-soft` tint (or a 2px `brand` underline for tabs). A solid `brand` fill is reserved for the
   one action button of a view.
9. **Gain and loss go through `Change`.** Render an amount or percentage that went up, down or did
   not change with the `Change` atom, never with a hand-written sign and colour. It applies the sign,
   the arrow, the `gain` / `loss` / `flat` colour and the zero rule (`0.00`, no sign, no arrow).
10. **Colour has one job each.** `brand` is the action colour. `secondary` (lilac) marks goals,
    projections and highlights, and is never a button or a chart series. `gain` and `loss` are for
    change only, and never category colours. Chart series use `viz-1` to `viz-6`, fixed per asset class.
11. **Use a shared primitive before writing one.** When a shared component exists for a card, button,
    icon button, field, segmented control, pagination, table or empty state, use it. Check
    `components/ui/index.ts` first and export new reusable components from it.
12. **Border utilities repeat the word.** Variables are named `--border-*`, and Tailwind adds its own
    prefix, so the classes are `border-border-default` and `border-border-subtle`.

## Colour tokens

Each token is a variable on `:root` named `--<token>`, mapped in `@theme inline` so Tailwind
generates `bg-<token>`, `text-<token>`, `border-<token>` and the other colour utilities from it.

| Group          | Tokens                                                                                             | Use for                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Brand**      | `brand`, `brand-hover`, `brand-fg`, `brand-soft`                                                   | The one filled action button, links, focus ring, selection tints                                        |
| **Secondary**  | `secondary`, `secondary-soft`                                                                      | Goals, projections and highlights                                                                       |
| **Surface**    | `surface`, `surface-sunken`, `surface-muted`, `surface-nav`, `surface-inverse`, `scrim`            | Cards and inputs; page ground; hover and track; sidebar and tab bar; tooltips; the layer behind dialogs |
| **Border**     | `border-subtle`, `border-default`, `border-control`, `border-strong`                               | Row dividers; card and table edges; input and secondary button outlines; the rule above totals          |
| **Foreground** | `fg`, `fg-muted`, `fg-subtle`, `fg-faint`, `fg-inverted`, `fg-on-inverse`                          | Text and icon hierarchy; text on a brand fill; text on a tooltip                                        |
| **Change**     | `gain`, `gain-soft`, `loss`, `loss-soft`, `flat`                                                   | Amounts that went up, down or did not change (through `Change`)                                         |
| **Status**     | `success`, `success-soft`, `warning`, `warning-soft`, `danger`, `danger-soft`, `info`, `info-soft` | Badges, banners, validation and notices                                                                 |
| **Focus**      | `focus-ring`, `focus-ring-width`                                                                   | The 2px ring at a 1px offset on every control                                                           |
| **Chart**      | `viz-1` to `viz-6`, `chart-grid`, `chart-axis`                                                     | One colour per asset class; horizontal gridlines; 11px axis labels                                      |

`focus-ring-width` is a plain variable with no Tailwind utility. Border tokens are used as
`border-border-*`, `divide-border-*` and so on.

### Values

Tokens with a literal value. Light is the `:root` value and dark is the `.dark` override; both live
in `theme.css`. `theme.test.ts` checks both columns and the alias table below against `theme.css`, and the dark column against [V1 design](design-v1.md).

| Token            | Light       | Dark        |
| ---------------- | ----------- | ----------- |
| `brand`          | `#17503a`   | `#7fd6a8`   |
| `brand-hover`    | `#0f3d2b`   | `#a3e4c2`   |
| `brand-soft`     | `#e3f0e9`   | `#173326`   |
| `secondary`      | `#6b4fd8`   | `#b5a4ff`   |
| `secondary-soft` | `#ece8fc`   | `#2a2350`   |
| `surface`        | `#ffffff`   | `#161d19`   |
| `surface-sunken` | `#f6f5f1`   | `#0e1411`   |
| `surface-muted`  | `#eeede7`   | `#1e2722`   |
| `surface-nav`    | `#fbfaf7`   | `#121915`   |
| `scrim`          | `#15201b66` | `#00000099` |
| `border-subtle`  | `#e9e7e0`   | `#232d27`   |
| `border-default` | `#dad7ce`   | `#2e3a33`   |
| `border-control` | `#8f8c82`   | `#6c7a72`   |
| `border-strong`  | `#7a8078`   | `#8b978f`   |
| `fg`             | `#15201b`   | `#edf1ee`   |
| `fg-muted`       | `#535c56`   | `#a9b4ad`   |
| `fg-subtle`      | `#667069`   | `#8a968e`   |
| `fg-faint`       | `#879089`   | `#5e6a63`   |
| `fg-inverted`    | `#ffffff`   | `#0e1411`   |
| `gain`           | `#167242`   | `#5fd39a`   |
| `gain-soft`      | `#e1f3e8`   | `#153324`   |
| `loss`           | `#c2372b`   | `#ff8f85`   |
| `loss-soft`      | `#fbe7e4`   | `#3d1a17`   |
| `warning`        | `#8a5300`   | `#f0b34a`   |
| `warning-soft`   | `#fbf0d9`   | `#33260c`   |
| `info`           | `#23618e`   | `#6fb4e6`   |
| `info-soft`      | `#e6f0f8`   | `#142a3a`   |
| `viz-1`          | `#2e8b62`   | `#5fc796`   |
| `viz-2`          | `#2f7fb8`   | `#6fb4e6`   |
| `viz-3`          | `#b87a1a`   | `#edb95a`   |
| `viz-4`          | `#b2583a`   | `#e09a78`   |
| `viz-5`          | `#8e4a8a`   | `#cf95cb`   |
| `viz-6`          | `#8a9189`   | `#7c877f`   |

Tokens that are aliases follow the theme and are not repeated in `.dark`:

| Token                     | Alias of                                            |
| ------------------------- | --------------------------------------------------- |
| `brand-fg`                | `brand-hover`                                       |
| `surface-inverse`         | `fg` (so a tooltip is dark on light, light on dark) |
| `fg-on-inverse`           | `surface-sunken`                                    |
| `flat`                    | `fg-muted`                                          |
| `success`, `success-soft` | `gain`, `gain-soft`                                 |
| `danger`, `danger-soft`   | `loss`, `loss-soft`                                 |
| `focus-ring`              | `brand`                                             |
| `chart-grid`              | `border-subtle`                                     |
| `chart-axis`              | `fg-subtle`                                         |

`brand` is evergreen on light and mint on dark. Which token to use for which job, and the contrast each
pair must keep, is in [V1 design, section 2](design-v1.md#2-colour-tokens).

### Chart and category colours

- `viz-1` savings (green), `viz-2` investments (blue), `viz-3` pension (amber), `viz-4` property
  (terracotta), `viz-5` other assets (plum), `viz-6` debt (grey, drawn below zero). One series of
  one asset class keeps its colour on every page. A single-series chart line is `brand` over a
  `brand-soft` fill.
- Recharts props for horizontal gridlines, 11px tabular axis labels and the inverse tooltip live in
  `packages/frontend/src/lib/chartStyles.ts`; `components/finance/chartTheme.tsx` adds the tooltip
  content and legend components. Chart code reads colours as `var(--viz-*)`, `var(--chart-grid)` and
  `var(--chart-axis)` and never hard-codes them.
- `DATA_COLORS` in `packages/frontend/src/lib/dataColors.ts` holds the categorical colours saved in
  API payloads. Their hex values are identities and never change; `dataColorToken()` displays a
  saved preset through the matching `--data-*` variable, and `--data-*` points at a `--viz-*` colour,
  so several identities share one colour; the legacy expense and alert identities display in
  terracotta (`viz-4`), never in the loss red. Custom user colours pass through unchanged.
- Category colour pickers (goals, budget categories, debts) offer only the six `CATEGORY_COLORS`, one
  canonical identity per `viz-*` colour. A saved value that is no longer offered is not rewritten:
  `categoryColorFor()` picks the swatch the picker shows as selected, and the value keeps displaying
  through `dataColorToken()`.
- A liability balance or an outgoing payment reads as a negative amount with a true minus sign
  through `formatAsNegative()` in `packages/frontend/src/lib/liability.ts`.

### Removed names

The names used before V1 are no longer defined, so a utility built from one of them compiles to
nothing: the `accent-*` families, `brand-accent`, `brand-deep`, `brand-strong`, `brand-tint`,
`brand-disabled`, `brand-border`, `brand-soft-strong`, the `-fg`, `-border`, `-muted`, `-strong`,
`-accent` and `-soft-strong` variants of the status tokens, `fg-strong`, `fg-emphasis`,
`fg-disabled`, `fg-deep`, `overlay`, `surface-inverse-raised` and the gradient and code surfaces.
Use the tokens above. The `--data-*` variables have no Tailwind utility; read a saved colour with
`dataColorToken()` and a chart colour as `var(--viz-*)`.

## Type

One family, Geist (variable, weights 400 to 600), self-hosted through `@fontsource-variable/geist`.
`--font-sans` is the stack `'Geist Variable', system-ui, -apple-system, sans-serif`, and
`--default-mono-font-family` points at it too, so `code` and `pre` use it as well. Each type
utility sets size, line height, weight and letter spacing together; add a colour class next to
it (`text-label text-fg-muted`).

| Utility               | Size / line height                    | Weight | Tracking | Use                                               |
| --------------------- | ------------------------------------- | ------ | -------- | ------------------------------------------------- |
| `text-figure-display` | 48px / 52px (36px / 40px below 640px) | 600    | -0.025em | The landing page headline only                    |
| `text-figure-hero`    | 30px / 36px (34px / 40px below 640px) | 600    | -0.02em  | The one headline figure of a page                 |
| `text-figure-lg`      | 20px / 24px                           | 600    | -0.01em  | Stat cards                                        |
| `text-figure-md`      | 14px / 20px (15px below 640px)        | 500    | 0        | Figures outside tables: list rows, meter captions |
| `text-figure-cell`    | 13px / 18px                           | 400    | 0        | Table cells, right-aligned                        |
| `text-title-page`     | 20px / 28px                           | 600    | -0.01em  | Page title                                        |
| `text-title-section`  | 15px / 20px                           | 600    | 0        | Card and dialog titles                            |
| `text-body`           | 14px / 20px (15px below 640px)        | 400    | 0        | Prose                                             |
| `text-cell`           | 13px / 18px                           | 400    | 0        | Tables and controls                               |
| `text-field`          | 13px / 18px (16px / 20px below 640px) | 400    | 0        | Text in inputs, selects and text areas            |
| `text-label`          | 12px / 16px                           | 500    | 0        | Field labels, column headers, stat labels         |
| `text-caption`        | 12px / 16px                           | 400    | 0        | Captions and timestamps                           |

- The four `figure` styles from `figure-hero` down also lock tabular, lining numerals;
  `figure-display` is a headline, not a figure, and keeps proportional numerals. Every number that can be compared with
  another uses them or `font-numeric`, right-aligned in columns.
- `text-field` is 16px below 640px because iOS Safari zooms into a focused field whose text is
  smaller. Style fields with `getFieldChrome` and do not pass a smaller text size to one.
- 11px is the floor, for badges, tab-bar labels and chart axes only.
- Add a new style as an `@utility` in `theme.css` and add its name to `TYPE_SCALE_UTILITIES` in
  `lib/utils.ts`. `cn()` merges classes with tailwind-merge, which reads an unknown `text-*` class
  as a colour and would otherwise drop the type style next to a colour class.
- The base layer sets defaults: `body` is `text-body`, `h1` is `text-title-page`, `h2` and `h3` are
  `text-title-section`, `label` is `text-label`, `button` is `text-cell` at weight 500 and `input` is
  `text-field`. A class on the element overrides them.

## Density and shape

| What                       | Laptop (1024px and wider)                       | Phone (below 640px)                |
| -------------------------- | ----------------------------------------------- | ---------------------------------- |
| Table row                  | 28px; 36px (`density="default"`)                | Card rows, each line at least 48px |
| Button, input, icon button | 32px; 28px (`sm`) in toolbars and inside tables | At least 44px                      |
| Segmented control          | 28px with a 1px border                          | 44px options that share the width  |
| Card padding               | 16px                                            | 16px                               |
| Card header                | 36px, 12px side padding, bottom border          | 44px, 16px side padding            |
| Gap between cards          | 16px                                            | 16px                               |
| Gap between sections       | 24px                                            | 16px                               |
| Page gutter                | 24px                                            | 16px                               |
| Sidebar item               | 32px                                            | 44px (in the drawer)               |
| Header                     | 48px                                            | 56px                               |

| Utility        | Value | Use                                                                                                              |
| -------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| `rounded-sm`   | 4px   | Badges and chips                                                                                                 |
| `rounded-md`   | 6px   | Buttons, inputs and table controls                                                                               |
| `rounded-lg`   | 10px  | Cards, dialogs, menus and touch buttons                                                                          |
| `rounded-xl`   | 12px  | Cards below 640px (`Card`, `StatCard` and the phone card rows of `DataTable`); the top corners of a bottom sheet |
| `rounded-full` | 999px | Avatars, status dots and progress meters only                                                                    |

`--radius-sm`, `--radius-md`, `--radius-lg` and `--radius-xl` are set to these values inside
`@theme inline` and have no raw variable on `:root`. Borders are always 1px and table rows are square.

| Shadow utility   | Light                             | Dark                           | Use                 |
| ---------------- | --------------------------------- | ------------------------------ | ------------------- |
| `shadow-popover` | `0 4px 12px rgb(15 20 18 / 0.12)` | `0 4px 12px rgb(0 0 0 / 0.5)`  | Menus, tooltips     |
| `shadow-overlay` | `0 16px 40px rgb(15 20 18 / 0.2)` | `0 16px 40px rgb(0 0 0 / 0.6)` | Dialogs and drawers |

`shadow-card` and `shadow-brand` exist as empty shadows so no card or button casts one; do not give
them a value. A dialog sits on `scrim` with no backdrop blur.

## Motion

| Token                    | Value                        | Utility                                 |
| ------------------------ | ---------------------------- | --------------------------------------- |
| `motion-fast`            | 100ms                        | `duration-fast`: hover and press        |
| `motion-base`            | 160ms                        | `duration-base`: menus, dialogs, sheets |
| `motion-slow`            | 300ms                        | `duration-slow`                         |
| `motion-ease-standard`   | `cubic-bezier(0.2, 0, 0, 1)` | `ease-standard`                         |
| `motion-ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` | `ease-emphasized`                       |

`duration-*` sets both `transition-duration` and `--tw-duration`, so `transition-colors duration-fast`
works. Feedback is immediate: a control changes on press (`active:`), not on release. A dialog fades
in over its scrim; below 640px it is a bottom sheet that rises from the bottom edge and leaves the
same way. Nothing scales, bounces or slides in from the side, and figures never count up. Under
`prefers-reduced-motion: reduce` the sheet only fades and the shell's drawer does not animate
(`motion-safe:` and `motion-reduce:` variants); the 100ms colour changes stay because they carry state.

### Forms and the virtual keyboard

Below 640px a dialog's actions are sticky and share one 44px row (a danger action takes a row above
them), so they leave room for the fields when a keyboard is open. The page asks browsers that
resize the layout for the keyboard to do so (`interactive-widget=resizes-content` in
`index.html`); where the layout does not resize (iOS Safari), `Modal` sizes itself to the visual
viewport through `useVisualViewport`. A `FormField` that gains an error scrolls it into view above
the sticky actions and, for the first such field, moves focus to its control unless another field
is being typed in. Pass the error to `FormField` rather than rendering your own message, so this
behaviour and the `role="alert"` announcement stay shared.

## Dark mode

Settings → Preferences → Appearance offers Light, Dark and System; System is the default and follows
the operating system live. The choice is kept in the browser (`localStorage` key `quro-theme`), not
in the account, so each device can differ; other open tabs follow it at once.

- `theme.css` redefines every literal colour and the popover and overlay shadows in a `.dark { … }`
  block. Aliases (`var(--…)`) follow on their own, so components use the same utilities in both
  themes and need no `dark:` variants.
- The `dark` class sits on `<html>`. `packages/frontend/public/theme-init.js` sets it before the
  first paint, so a reload never flashes the other theme; it is a same-origin file rather than an
  inline script because the bundled nginx Content-Security-Policy allows scripts from `'self'`
  only. After start-up `applyTheme` in `packages/frontend/src/lib/theme.ts` and the `useTheme` hook
  keep the class and the `theme-color` meta in step. The init script and `theme.ts` share their test
  cases in `packages/frontend/src/lib/theme.test.ts`; change both together.
- `packages/frontend/src/styles/theme.test.ts` fails when a literal colour on `:root` has no dark
  value or a dark value differs from the "Dark" column of [V1 design](design-v1.md).
- Tailwind's `dark:` variant follows the class (`@custom-variant dark` in `theme.css`), not
  `prefers-color-scheme`. Prefer a token over a `dark:` override.
- An installed app (`packages/frontend/public/site.webmanifest`) starts on the light ground
  (`background_color` `#F6F5F1`) in both themes: a manifest has one background colour and the theme
  is only known once `theme-init.js` runs, so the splash stays light and the page turns dark as it
  loads. Its icons come in two sets: `web-app-icon-*.png` (`purpose: any`) are the rounded evergreen
  tile of `favicon.svg` for platforms that show an icon as it is, and `web-app-manifest-*.png`
  (`purpose: maskable`) are full-bleed evergreen with the mark inside the safe zone, for
  platforms that cut their own shape. Render both from the SVGs with `rsvg-convert` at 192 and
  512px.

## Adding a token

1. Add the raw variable on `:root` in `theme.css`.
2. If its value is a colour or shadow rather than a `var()` alias, add its dark value to the `.dark`
   block as well. Aliases are not repeated there.
3. Map it inside the `@theme inline` block under the right namespace (`--color-*` for colours,
   `--shadow-*` for shadows, `--transition-duration-*` and `--ease-*` for motion, `--radius-*` for
   radius) so it becomes a Tailwind utility.
4. Add it to this page and to [V1 design](design-v1.md), which `theme.test.ts` reads, and use it
   from primitives.

## Shared UI at a glance

All of it is exported from `packages/frontend/src/components/ui/index.ts`. The sizes are the laptop
sizes of [density](#density-and-shape); every interactive element is at least 44px on a phone.

| Layer     | Components                                                                                                                                                                                                       | V1 rules they carry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atoms     | `Button`, `IconButton`, `TextInput`, `CurrencyInput`, `DateInput`, `MonthInput`, `PasswordInput`, `SelectInput`, `Textarea`, `Badge`, `Card`, `Change`, `ProgressMeter`, `Spinner`, `LoadingSpinner`, `QuroLogo` | `Button` variants `primary` (the one `brand` fill), `secondary` (bordered), `danger` (outlined), `dangerSolid` (filled, only in the confirm step of a destructive action) and `ghost`; sizes `sm` 28px, `md` 32px, `lg` 44px, `xl` 48px; fields share `getFieldChrome` (32px, `border-control`, 2px focus ring); `SelectInput` hides the native arrow (`select-chevron`) and draws a 12px chevron from `--select-chevron` (one value per theme in `theme.css`) 12px from the right edge, with 36px of right padding so long option text is cut before the arrow; `Badge` is a 1px edge on a soft fill, 11px; `Card` is a bordered `rounded-lg` surface with no shadow (`rounded-xl` below 640px); `ProgressMeter` is a 6px rounded track; `QuroLogo` draws in `currentColor` (`text-brand`)                                                                                                                                                                                                                                                                                                                   |
| Molecules | `FormField`, `SegmentedControl`, `Pagination`, `PanelHeader`, `EmptyState`, `LoadingState`, `RowActions`, `DateNoteRow`, `TxnTypeSelector`, `EmojiPickerField`, `PdfAttachmentField`                             | `FormField` labels use `text-label text-fg-muted`; `SegmentedControl` is one bordered group whose selected option is a `brand-soft` tint (the `underline` variant is a tablist with one tab in the Tab order and arrow, Home and End keys; pass `tabsId` and render the page with `role="tabpanel"` and `segmentedPanelId`, and it selects with a 2px `brand` underline); `Pagination` marks the current page with the same tint and draws no rule of its own, because the table or panel footer it sits in does; `PanelHeader` is the 36px card header; `EmptyState` is a dashed, left-aligned box with a title, one line and at most one button                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Organisms | `DataTable`, `TxnHistoryPanel`, `StatCard`, `StatsGrid`, `ChartCard`, `AreaChartCard`, `Modal`, `ArchiveOrDeleteDialog`, `ArchivedItemsSection`                                                                  | 28px table rows with a plain sentence-case header; `StatCard` is label, figure and change, with its change either a formatted string (`{ value, positive }`) or a signed number (`{ amount, format, currency, label }`) rendered through `Change`, and the number is preferred; chart cards are a card header over one `brand` series, with an optional `belowContent` row under the chart that stays when there is no data (the dashboard puts its range control there below 640px and in the header from 640px); `Modal` is a dialog on `scrim` that becomes a bottom sheet below 640px with a sticky footer; it is mounted while open, or kept mounted with `open={false}` until `onExited` (`useModalPresence`) to play the closing transition; a `DataTableCell` with a caption under its first line takes `stacked` (6px more room above and below from 768px; single-line cells keep the 28px row); `DataTable` rows below 768px are cards that leave out `secondary` and `tertiary` columns until the row's "Show details" button opens them, and a "Sort by" control stands in for the hidden header |
| Templates | `PageStack`, `ContentSection`                                                                                                                                                                                    | `PageStack` pads the page (24px, 16px on a phone) and spaces sections 24px (16px); `ContentSection` takes an optional `title` in the section title style                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Layout    | `Layout`, `SidebarItem`, `TabBar`, `navItems` in `components/layout/`                                                                                                                                            | A 208px `surface-nav` sidebar (72px collapsed) from 1024px with 32px items and a `brand-soft` active item; a 48px header; below 1024px the sidebar is a drawer opened by the header menu button (from 640px) or by "More" on the phone, and an open drawer is modal (focus stays inside, Escape or its close button closes it and focus returns to the opener, the page behind it is inert); each page keeps its own scroll position; below 640px a 56px header and a `surface-nav` tab bar (Dashboard, Savings, Investments, Budget, More) fixed to the bottom, padded by the bar's height and the safe area                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Finance   | `TxnAmount`, `PreviewPanel`, `PreviewRow`, `chartTheme`, `stopRowClick` in `components/finance/`                                                                                                                 | `TxnAmount` signs a transaction amount: money in reads `+` in the `gain` colour, money out reads a true minus in the figure colour (gains and losses of a value use `Change`); `PreviewPanel` and `PreviewRow` show a calculated result under a form; `chartTheme` holds the axis, gridline, tooltip and legend settings for Recharts charts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

The page-level pieces (settings sections, the signed-out landing page with its sign-in, sign-up and
password reset dialogs, the error screens, the notification panel) are built from these components
and the tokens above, with a card header and a footer for the save button, the page on the
`surface-sunken` ground and one filled button per view.

## Ownership boundaries

Shared UI owns visual consistency, responsive layout, accessibility mechanics,
and reusable interaction chrome. Components under
`packages/frontend/src/components/ui/` should expose small configuration props
for those concerns: tokenized color, density, header/footer slots, responsive
table behavior, row actions, pagination, loading, and empty states.

Feature modules own data, domain behavior, permissions, local sorting/filtering
state, copy, and custom cells. A feature should decide what a payslip, holding,
transaction, or import row means, then pass the resulting rows and handlers into
shared primitives. Do not move business rules into shared UI to avoid styling a
feature component.

### Building with shared primitives

- Native wrappers pass through HTML props, accept `className` and merge it with `cn`. Use the
  existing variants and sizes, and Lucide icons.
- Style form fields with `getFieldChrome` and aligned financial values with `font-numeric`.
- Unit prices (price per share, current, manual and historical prices) use `formatUnitPrice` from
  `@quro/shared`: two to four decimals in the user's number format. Money keeps two. Where a
  price and an average cost sit side by side (a holding's position strip), pass `decimals`
  (from `unitPriceDecimals` of the price) so both use one precision, and show a base-currency
  value as a smaller muted second line under the native one with a hidden "in EUR" cue.
- `Button` supports `loading` and disables itself while loading; use it instead of a separate
  submitting-button pattern.
- Keep loading, empty, error, disabled and submitting states, labels, keyboard controls and focus
  behavior when replacing markup.

## Table and list decision rules

Use `DataTable` for comparable records where columns carry meaning across rows:
salary payslips, debt payments, pension import review rows, investment holdings,
closed holdings, account balances, and future sortable/filterable datasets. Put
alignment, mobile labels, priority, widths, and numeric typography in the
`columns` config; row cells should reference columns with `columnKey`.

Use `TxnHistoryPanel` / `TxnRow` for chronological activity feeds where each row
is read as an event summary rather than compared column-by-column: mortgage,
pension, property, holding, and savings transaction histories. Keep these as
rows unless the UI needs desktop headers or aligned numeric comparison.

Use card grids for independent objects where scanning depends on object state or
visual grouping rather than shared columns: goal cards, property cards, account
cards, debt cards, and dashboard overview cards.

Current audit status and default direction:

| Surface                         | Decision                     | Notes                                             |
| ------------------------------- | ---------------------------- | ------------------------------------------------- |
| Salary payslip history          | `DataTable`                  | Financial table with selected rows.               |
| Debt payment history            | `DataTable`                  | Compact financial table.                          |
| Investment active holdings      | `DataTable`                  | Expandable financial table.                       |
| Investment closed holdings      | `DataTable`                  | Expandable financial table.                       |
| Pension statement import review | `DataTable`                  | Editable review table.                            |
| Transaction history panels      | `TxnHistoryPanel` / `TxnRow` | Event feeds; do not force into tables by default. |
| Budget categories               | Card with progress rows      | Each category pairs a meter with its own figures. |
| Dashboard recent transactions   | `DataTable`                  | Compact; one line per row on phones.              |

## `DataTable` usage

Import the table shell and row primitives from the shared UI barrel:

```tsx
import {
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  RowActions,
  type DataTableColumn,
  type DataTableSortState,
} from '@/components/ui';
```

Define columns outside render when possible. The column config is the source of
truth for desktop headers and mobile card labels.

```tsx
const PAYMENT_COLUMNS: readonly DataTableColumn[] = [
  {
    key: 'date',
    header: 'Date',
    mobileLabel: 'Date',
    priority: 'primary',
    sortable: true,
    defaultSortDirection: 'desc',
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    mobileLabel: 'Amount',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'font-semibold text-fg',
  },
  {
    key: 'interest',
    header: 'Interest',
    align: 'right',
    mobileLabel: 'Interest',
    priority: 'secondary',
    numeric: true,
  },
  { key: 'actions', header: '', priority: 'actions', width: 48 },
];
```

Render rows with `DataTableRow` and `DataTableCell`. Prefer `columnKey` over
repeating alignment, labels, numeric styling, and priority on every cell.

```tsx
<DataTable
  title="Payment history"
  subtitle={`${payments.length} payments`}
  action={
    <Button onClick={onLogPayment} variant="primary" size="sm">
      Log payment
    </Button>
  }
  columns={PAYMENT_COLUMNS}
  sort={sort}
  onSortChange={setSort}
  isEmpty={payments.length === 0}
  emptyState="No payments recorded yet."
  minWidth={720}
  tableLayout="fixed"
  tableVariant="financial"
>
  {sortedPayments.map((payment) => (
    <DataTableRow key={payment.id} interactive>
      <DataTableCell columnKey="date">{formatShortDate(payment.date)}</DataTableCell>
      <DataTableCell columnKey="amount">{fmtNative(payment.amount)}</DataTableCell>
      <DataTableCell columnKey="interest">{fmtNative(payment.interest)}</DataTableCell>
      <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
        <RowActions>{/* icon buttons */}</RowActions>
      </DataTableCell>
    </DataTableRow>
  ))}
</DataTable>
```

### Mobile behavior and priority

`DataTable` renders normal table headers on desktop and card-like rows on
mobile. The desktop header is hidden under the medium breakpoint. Each mobile
cell shows a label from `mobileLabel`, falling back to `header` when the header
is plain text. Rows are 28px in the default `compact` density and 36px in
`default` density; on mobile each card line is at least 48px below 640px. Mark a
total row with `<DataTableRow data-total>` for the strong rule and semibold
figures.

Use `priority` to decide what survives on mobile:

| Priority    | Mobile behavior                    | Use for                                             |
| ----------- | ---------------------------------- | --------------------------------------------------- |
| `primary`   | Visible                            | Identity, current value, total, key status          |
| `secondary` | Hidden below the medium breakpoint | Supporting values that are useful but not essential |
| `tertiary`  | Hidden below the medium breakpoint | Rarely needed comparison data or audit details      |
| `actions`   | Visible                            | Row menus, edit/delete buttons, expansion controls  |

Choose `primary` columns by reading one mobile card in isolation. A user should
understand the object, its current state, and the available row actions without
secondary columns. Keep high-density numeric comparison on desktop by setting
`minWidth` and `tableLayout="fixed"` when columns need stable widths.

Use `numeric: true` for money, quantities, rates, and percentages. It applies
the shared `font-numeric` utility and right-aligns the column unless `align`
says otherwise.

### Table slots

Use `toolbar` for commands that change the table view or batch behavior, such as
search, density controls, export, or bulk actions. Use `filters` for active
domain filters that narrow the dataset. Use `footer` for pagination, result
counts, totals, or secondary table status.

```tsx
<DataTable
  columns={columns}
  toolbar={<BulkActions selectedCount={selectedIds.length} onClear={clearSelection} />}
  filters={
    <TransactionFilters
      category={category}
      status={status}
      onCategoryChange={setCategory}
      onStatusChange={setStatus}
    />
  }
  footer={
    <Pagination
      page={page}
      totalPages={totalPages}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      totalCount={totalCount}
      onChange={setPage}
    />
  }
>
  {rows}
</DataTable>
```

### Empty and loading states

Use the `isEmpty`, `emptyState`, `isLoading`, and `loadingState` props instead
of branching around the table shell. That keeps header, filters, footer, and
responsive spacing stable while data changes.

```tsx
<DataTable
  columns={columns}
  isLoading={query.isLoading}
  loadingState="Loading payslips..."
  isEmpty={!query.isLoading && payslips.length === 0}
  emptyState={
    <>
      No payslips yet. Click <strong>Add payslip</strong> to get started.
    </>
  }
>
  {payslips.map((payslip) => (
    <PayslipRow key={payslip.id} payslip={payslip} />
  ))}
</DataTable>
```

### Row actions

Keep row actions in an `actions` column and use shared action primitives. Stop
event propagation when an action lives inside an interactive row so clicking
`Edit`, `Delete`, or `Download` does not also select or expand the row.

```tsx
<DataTableRow onClick={() => onSelect(row.id)} interactive selected={row.id === selectedId}>
  <DataTableCell columnKey="name">{row.name}</DataTableCell>
  <DataTableCell columnKey="amount">{fmt(row.amount)}</DataTableCell>
  <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
    <RowActions>
      <IconButton
        icon={Edit3}
        label="Edit row"
        title="Edit row"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(row);
        }}
      />
    </RowActions>
  </DataTableCell>
</DataTableRow>
```

### Custom domain cells

Custom cells belong in feature modules. Build a small feature-local component
for domain formatting, then render it inside `DataTableCell`. Let `DataTable`
handle the outer cell layout and responsive labels.

```tsx
function HoldingAssetCell({ holding }: { holding: Holding }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-cell font-medium text-fg">{holding.name}</p>
      <p className="truncate text-caption text-fg-subtle">{holding.ticker}</p>
    </div>
  );
}

<DataTableCell columnKey="asset">
  <HoldingAssetCell holding={holding} />
</DataTableCell>;
```

## `TxnHistoryPanel` usage

Use `TxnHistoryPanel` for chronological event feeds where users scan activity
by date, type, and amount. It owns the panel shell, filter bar, optional stats,
add action, empty message, and footer. Feature modules own the transaction rows,
filter value, pagination state, and handlers.

```tsx
<TxnHistoryPanel
  title="Transaction history"
  subtitle={`${transactions.length} transactions`}
  filterOptions={[
    { key: 'all', label: 'All' },
    { key: 'deposit', label: 'Deposits' },
    { key: 'withdrawal', label: 'Withdrawals' },
  ]}
  filter={filter}
  onFilterChange={setFilter}
  stats={[
    { label: 'In', value: <TxnAmount value={inflow} format={fmt} /> },
    { label: 'Out', value: <TxnAmount value={-outflow} format={fmt} /> },
  ]}
  onAdd={onAddTransaction}
  addLabel="Add transaction"
  emptyMessage="No transactions match this filter."
  footer={
    <Pagination
      page={page}
      totalPages={totalPages}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      totalCount={totalCount}
      onChange={setPage}
    />
  }
  isEmpty={transactions.length === 0}
>
  {transactions.map((transaction) => (
    <TxnRow
      key={transaction.id}
      icon={transaction.type === 'deposit' ? ArrowUpRight : ArrowDownRight}
      iconColor={transaction.type === 'deposit' ? 'text-gain' : 'text-fg-muted'}
      date={transaction.date}
      label={transaction.note ?? 'Transaction'}
      amount={<TxnAmount value={signedAmount(transaction)} format={fmt} />}
      onEdit={() => onEdit(transaction)}
      onDelete={() => onDelete(transaction.id)}
    />
  ))}
</TxnHistoryPanel>
```

Pass `striped` for a long history that is read across, such as a holding's transactions. It
tints every second row with `surface-sunken` and draws the rules in `border-default`; a
row's `surface-muted` hover and an `aria-selected` row stay above the stripe. Check text on both
stripes for 4.5:1 in light and dark. It is off by default, so other feeds do not change.

Reach for `DataTable` instead when the same records need desktop headers,
sortable columns, aligned comparison, column priority, or custom table footer
totals. Do not recreate a one-off card list with hardcoded borders and filters
when `TxnHistoryPanel` already fits the feed shape.

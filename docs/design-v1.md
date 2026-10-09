# V1 design

This page specifies the V1 design: principles, colour tokens, type, density, shape, motion,
content rules, the logo and the names the code uses. It is the source of truth for the redesign.
Later changes implement these values; they do not round or rename them. It was revised on
09 Oct 2026 after a review of the design system (contrast audit, chart palette, selection rule,
zero change, scrim and status tokens).

[`packages/frontend/src/styles/theme.css`](../packages/frontend/src/styles/theme.css) holds the
light and dark colour values, shadows and motion of this page (VD03, VD04); until the radius, type
and shared UI steps land, it also holds the values the app renders today for those. See
[design tokens](design-tokens.md) for how tokens become Tailwind utilities and the rules for
using them.

## 1. Principles

1. **The figure is the interface.** Numbers are tabular and right-aligned. Labels are small and quiet. One hero figure per page.
2. **Dense by default.** 28px rows, 32px controls, 16px card padding on desktop; 48px rows and 44px controls on touch.
3. **Rules, not boxes.** Structure comes from 1px borders and alignment. No card shadows, no tinted icon tiles, no oversized pills.
4. **Green acts, lilac highlights.** `brand` (evergreen) is the action colour and the only filled control: one per view. Selection is a `brand-soft` tint or a 2px underline, never a fill. `secondary` (lilac) marks goals and projections. Gain and loss keep their own green and red.
5. **Sign, then colour.** A change carries a plus or a minus sign; zero carries neither. Colour only reinforces it.
6. **Light, dark, desktop, phone.** Every token has a dark value and every pattern has a touch size.

## 2. Colour tokens

The design system calls the action colour "primary". The code keeps the existing name `brand`, so existing utilities such as `bg-brand` keep working. Rows marked "(new)" were added to `theme.css` with the light values. Rows whose value is `var(--…)` are aliases, written exactly so in `:root`; rows marked "Legacy alias" exist only until the components that use them are migrated (VD14 to VD17) and are deleted in VD19.

| Variable                   | Light                    | Dark                     | Use                                                                                                         |
| -------------------------- | ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `--brand`                  | `#17503A`                | `#7FD6A8`                | Primary action, links, focus ring, single-series chart line ("primary" in the design system)                |
| `--brand-hover`            | `#0F3D2B`                | `#A3E4C2`                | Hover and press on brand; text on brand-soft ("primary-hover")                                              |
| `--brand-fg`               | `var(--brand-hover)`     | `var(--brand-hover)`     | Text on brand-soft; the same value as brand-hover                                                           |
| `--brand-soft`             | `#E3F0E9`                | `#173326`                | Every selection: active nav item, selected row, selected segment, current page; chart fill ("primary-soft") |
| `--brand-disabled`         | `var(--surface-muted)`   | `var(--surface-muted)`   | Legacy alias, deleted at VD19                                                                               |
| `--brand-border`           | `var(--border-default)`  | `var(--border-default)`  | Legacy alias, deleted at VD19                                                                               |
| `--brand-soft-strong`      | `var(--brand-soft)`      | `var(--brand-soft)`      | Legacy alias, deleted at VD19                                                                               |
| `--secondary (new)`        | `#6B4FD8`                | `#B5A4FF`                | Goals, projections (dashed lines), highlights. Never a button colour, never a chart series                  |
| `--secondary-soft (new)`   | `#ECE8FC`                | `#2A2350`                | Behind goal and projection chips                                                                            |
| `--surface`                | `#FFFFFF`                | `#161D19`                | Cards, tables, inputs                                                                                       |
| `--surface-sunken`         | `#F6F5F1`                | `#0E1411`                | Page background ("ground")                                                                                  |
| `--surface-muted`          | `#EEEDE7`                | `#1E2722`                | Hover and press fill, disabled controls, progress track                                                     |
| `--surface-nav (new)`      | `#FBFAF7`                | `#121915`                | Sidebar and phone tab bar                                                                                   |
| `--surface-inverse`        | `var(--fg)`              | `var(--fg)`              | Tooltip fill                                                                                                |
| `--surface-inverse-raised` | `var(--surface-inverse)` | `var(--surface-inverse)` | Legacy alias, deleted at VD19                                                                               |
| `--scrim (new)`            | `#15201B66`              | `#00000099`              | Behind dialogs and sheets; no blur                                                                          |
| `--border-subtle`          | `#E9E7E0`                | `#232D27`                | Row dividers ("rule")                                                                                       |
| `--border-default`         | `#DAD7CE`                | `#2E3A33`                | Card and table edges ("border")                                                                             |
| `--border-control (new)`   | `#8F8C82`                | `#6C7A72`                | Inputs and secondary buttons                                                                                |
| `--border-strong`          | `#7A8078`                | `#8B978F`                | Rule above total rows                                                                                       |
| `--fg`                     | `#15201B`                | `#EDF1EE`                | Figures and primary text                                                                                    |
| `--fg-muted`               | `#535C56`                | `#A9B4AD`                | Labels, column headers                                                                                      |
| `--fg-subtle`              | `#667069`                | `#8A968E`                | Captions, timestamps, disabled control text                                                                 |
| `--fg-faint`               | `#879089`                | `#5E6A63`                | Placeholders and resting icons only                                                                         |
| `--fg-inverted`            | `#FFFFFF`                | `#0E1411`                | Text on brand and danger fills ("fg-on-primary")                                                            |
| `--fg-on-inverse (new)`    | `var(--surface-sunken)`  | `var(--surface-sunken)`  | Text on surface-inverse (tooltips)                                                                          |
| `--fg-strong`              | `var(--fg)`              | `var(--fg)`              | Legacy alias, deleted at VD19                                                                               |
| `--fg-emphasis`            | `var(--fg)`              | `var(--fg)`              | Legacy alias, deleted at VD19                                                                               |
| `--fg-disabled`            | `var(--fg-faint)`        | `var(--fg-faint)`        | Legacy alias, deleted at VD19                                                                               |
| `--gain (new)`             | `#167242`                | `#5FD39A`                | Positive change                                                                                             |
| `--gain-soft (new)`        | `#E1F3E8`                | `#153324`                | Behind gain chips                                                                                           |
| `--loss (new)`             | `#C2372B`                | `#FF8F85`                | Negative change                                                                                             |
| `--loss-soft (new)`        | `#FBE7E4`                | `#3D1A17`                | Behind loss chips                                                                                           |
| `--flat (new)`             | `var(--fg-muted)`        | `var(--fg-muted)`        | No change                                                                                                   |
| `--success`                | `var(--gain)`            | `var(--gain)`            | Saved, synced, connected: the gain colour under its status name                                             |
| `--success-soft`           | `var(--gain-soft)`       | `var(--gain-soft)`       | Success badge and banner fill                                                                               |
| `--success-fg`             | `var(--success)`         | `var(--success)`         | Legacy alias, deleted at VD19                                                                               |
| `--success-border`         | `var(--success)`         | `var(--success)`         | Legacy alias, deleted at VD19                                                                               |
| `--success-soft-strong`    | `var(--success-soft)`    | `var(--success-soft)`    | Legacy alias, deleted at VD19                                                                               |
| `--warning`                | `#8A5300`                | `#F0B34A`                | Stale data, limits near: text and border                                                                    |
| `--warning-soft`           | `#FBF0D9`                | `#33260C`                | Warning badge and banner fill                                                                               |
| `--warning-fg`             | `var(--warning)`         | `var(--warning)`         | Legacy alias, deleted at VD19                                                                               |
| `--warning-border`         | `var(--warning)`         | `var(--warning)`         | Legacy alias, deleted at VD19                                                                               |
| `--warning-soft-strong`    | `var(--warning-soft)`    | `var(--warning-soft)`    | Legacy alias, deleted at VD19                                                                               |
| `--danger`                 | `var(--loss)`            | `var(--loss)`            | Errors, invalid fields, destructive actions: the loss colour under its status name                          |
| `--danger-soft`            | `var(--loss-soft)`       | `var(--loss-soft)`       | Error banner and danger badge fill                                                                          |
| `--danger-fg`              | `var(--danger)`          | `var(--danger)`          | Legacy alias, deleted at VD19                                                                               |
| `--danger-border`          | `var(--danger)`          | `var(--danger)`          | Legacy alias, deleted at VD19                                                                               |
| `--danger-soft-strong`     | `var(--danger-soft)`     | `var(--danger-soft)`     | Legacy alias, deleted at VD19                                                                               |
| `--info`                   | `#23618E`                | `#6FB4E6`                | Neutral notices and third-party labels such as a linked bank: text and border                               |
| `--info-soft`              | `#E6F0F8`                | `#142A3A`                | Info badge and banner fill                                                                                  |
| `--info-fg`                | `var(--info)`            | `var(--info)`            | Legacy alias, deleted at VD19                                                                               |
| `--info-border`            | `var(--info)`            | `var(--info)`            | Legacy alias, deleted at VD19                                                                               |
| `--info-soft-strong`       | `var(--info-soft)`       | `var(--info-soft)`       | Legacy alias, deleted at VD19                                                                               |
| `--focus-ring`             | `var(--brand)`           | `var(--brand)`           | 2px ring at 1px offset on every control                                                                     |
| `--viz-1 (new)`            | `#2E8B62`                | `#5FC796`                | Chart: savings (green)                                                                                      |
| `--viz-2 (new)`            | `#2F7FB8`                | `#6FB4E6`                | Chart: investments (blue)                                                                                   |
| `--viz-3 (new)`            | `#B87A1A`                | `#EDB95A`                | Chart: pension (amber)                                                                                      |
| `--viz-4 (new)`            | `#B2583A`                | `#E09A78`                | Chart: property (terracotta)                                                                                |
| `--viz-5 (new)`            | `#8E4A8A`                | `#CF95CB`                | Chart: other assets (plum)                                                                                  |
| `--viz-6 (new)`            | `#8A9189`                | `#7C877F`                | Chart: debt (grey), drawn below zero                                                                        |
| `--chart-grid (new)`       | `var(--border-subtle)`   | `var(--border-subtle)`   | Horizontal gridlines only                                                                                   |
| `--chart-axis (new)`       | `var(--fg-subtle)`       | `var(--fg-subtle)`       | Axis labels, 11px                                                                                           |

Rules:

- Never use raw hex values or raw Tailwind palette classes in components. Use the tokens.
- Amounts that went up or down use `gain` / `loss` / `flat`, never `brand` or `success`.
- `success` and `danger` are the gain and loss colours under their status names; `warning` is stale data and limits; `info` is a neutral notice or a third-party label.
- `secondary` is only for goals, projections and highlights. It is never a chart series, so a dashed projection is always distinct from the line it extends.
- Chart colours are fixed per asset class: `viz-1` savings, `viz-2` investments, `viz-3` pension, `viz-4` property, `viz-5` other assets, `viz-6` debt.
- Every text pair in the table measures at least 4.5:1 on the grounds its use names, in both themes; `border-control`, `focus-ring`, `fg-faint` and `viz-1` to `viz-6` measure at least 3:1 on `surface`.

## 3. Type

One family: Geist (variable, weights 400 to 600), self-hosted through `@fontsource-variable/geist`. The stack is `'Geist Variable', system-ui, -apple-system, sans-serif`; the platform font is the only fallback. No monospace, including `code` and `pre`. Every number that can be compared with another uses the `font-numeric` utility (tabular numerals) and is right-aligned in columns. Labels are sentence case; no uppercase, no letter-spaced labels. Tracking tightens as size grows and is 0 at body size and below.

| Style           | Size / line height                    | Weight | Letter spacing | Use                                                                       |
| --------------- | ------------------------------------- | ------ | -------------- | ------------------------------------------------------------------------- |
| `figure-hero`   | 30px / 36px (34px / 40px below 640px) | 600    | -0.02em        | The one headline figure of a page                                         |
| `figure-lg`     | 20px / 24px                           | 600    | -0.01em        | Stat cards                                                                |
| `figure-md`     | 14px / 20px (15px / 20px below 640px) | 500    | 0              | Figures outside tables: list rows, meter captions                         |
| `figure-cell`   | 13px / 18px                           | 400    | 0              | Table cells, right-aligned; total rows at weight 600                      |
| `title-page`    | 20px / 28px                           | 600    | -0.01em        | Page title                                                                |
| `title-section` | 15px / 20px                           | 600    | 0              | Card and dialog titles                                                    |
| `body`          | 14px / 20px (15px / 20px below 640px) | 400    | 0              | Prose                                                                     |
| `cell`          | 13px / 18px                           | 400    | 0              | Tables and controls                                                       |
| `label`         | 12px / 16px                           | 500    | 0              | Field labels, column headers, stat labels. Sentence case, `text-fg-muted` |
| `caption`       | 12px / 16px                           | 400    | 0              | Captions. 11px is the floor: badges, tab-bar labels and chart axes only   |

## 4. Density

| What                      | Desktop                                                   | Touch (below 640px)                               |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Table row                 | 28px (`h-7`); 36px (`h-9`) when the row has a second line | 48px (`h-12`)                                     |
| Button and input height   | 32px (`h-8`); 28px (`h-7`) in toolbars and inside tables  | at least 44px (`h-11`); main button 48px (`h-12`) |
| Card padding              | 16px (`p-4`)                                              | 16px                                              |
| Card header               | 36px high, `px-3`, bottom border                          | 44px                                              |
| Gap between cards         | 16px (`gap-4`)                                            | 16px                                              |
| Gap between page sections | 24px (`gap-6`)                                            | 16px                                              |
| Page gutter               | 24px (`p-6`)                                              | 16px (`p-4`)                                      |
| Cell and header padding   | 12px (`px-3`)                                             | 16px                                              |

## 5. Shape and elevation

| Token          | Value | Use                                               |
| -------------- | ----- | ------------------------------------------------- |
| `rounded-sm`   | 4px   | Badges and chips                                  |
| `rounded-md`   | 6px   | Buttons and inputs                                |
| `rounded-lg`   | 10px  | Cards, dialogs, menus, touch buttons              |
| `rounded-xl`   | 12px  | Cards on phone; the top corners of a bottom sheet |
| `rounded-full` | 999px | Avatars, status dots and progress meters only     |

- Borders are always 1px. Table rows are square.
- Cards have a border and **no shadow**. Only menus/tooltips (`shadow-popover`: `0 4px 12px rgb(15 20 18 / 0.12)`, dark `0 4px 12px rgb(0 0 0 / 0.5)`) and dialogs (`shadow-overlay`: `0 16px 40px rgb(15 20 18 / 0.2)`, dark `0 16px 40px rgb(0 0 0 / 0.6)`) cast a shadow.
- A dialog sits on `scrim`; there is no backdrop blur.

## 6. Motion

`motion-fast` 100ms (hover, press), `motion-base` 160ms (menus, dialogs), easing `cubic-bezier(0.2, 0, 0, 1)`. Feedback is immediate: a control changes on press (`:active`), not on release. A dialog fades in with its scrim; on phone it is a bottom sheet that rises from the bottom edge and leaves the same way. Nothing scales, bounces or slides in from the side, and figures never count up. Under `prefers-reduced-motion: reduce` the sheet fades instead of sliding; the 100ms colour changes stay, because they carry state.

## 7. Content rules

- Sentence case everywhere: "Add transaction".
- Buttons name the action and its object: "Delete account". One primary button per view.
- Navigation names the destination as the page names itself: "Dashboard", "Investments". No "Home", no abbreviations.
- Currency appears once: in the cell ("€ 1,250.00") or in the column header ("Balance (EUR)"), not both. Two decimals in tables. Use a true minus sign (U+2212) for negatives.
- Dates read "01 Oct 2026".
- Gain: `▲ +2,418.20` or `+1.84%`. Loss: `▼ −612.75` or `−0.43%`. Zero: `0.00` or `0.00%`, with no sign, no arrow and no dash. The arrow is a text glyph hidden from screen readers; a visually hidden "up" or "down" carries the meaning.

## 8. Logo

A rounded-square Q with a round-capped tail, one colour (evergreen on light, mint on dark), never a gradient:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect x="9" y="8" width="13" height="13" rx="4.5" stroke="currentColor" stroke-width="3"/>
  <path d="M18 17 L25 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
</svg>
```

## 9. Names in code

| Design system token | `theme.css` variable          |
| ------------------- | ----------------------------- |
| `ground`            | `--surface-sunken`            |
| `rule`              | `--border-subtle`             |
| `border`            | `--border-default`            |
| `primary`           | `--brand`                     |
| `primary-hover`     | `--brand-hover`, `--brand-fg` |
| `primary-soft`      | `--brand-soft`                |
| `fg-on-primary`     | `--fg-inverted`               |
| everything else     | the same name                 |

`DATA_COLORS` keeps its persisted hex identities; the `--data-*` display variables map onto `--viz-*` (VD03). The legacy aliases in section 2 are deleted in VD19 once nothing uses them.

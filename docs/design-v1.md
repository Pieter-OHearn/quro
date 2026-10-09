# V1 design

This page specifies the V1 design: principles, colour tokens, type, density, shape, motion,
content rules and the logo. It is the source of truth for the redesign. Later changes implement
these values; they do not round or rename them.

Until the migration is complete,
[`packages/frontend/src/styles/theme.css`](../packages/frontend/src/styles/theme.css) holds the
values the app renders today. See [design tokens](design-tokens.md) for how tokens become Tailwind
utilities and the rules for using them.

## 1. Principles

1. **The figure is the interface.** Numbers are tabular and right-aligned. Labels are small and quiet. One hero figure per page.
2. **Dense by default.** 28px rows, 32px controls, 16px card padding on desktop.
3. **Rules, not boxes.** Structure comes from 1px borders and alignment. No card shadows, no tinted icon tiles, no oversized pills.
4. **Green acts, lilac highlights.** `brand` (evergreen) is the action colour. `secondary` (lilac) marks goals and projections. Gain and loss keep their own green and red.
5. **Sign, then colour.** A change always carries a plus or minus sign. Colour only reinforces it.
6. **Light, dark, desktop, phone.** Every token has a dark value and every pattern has a touch size.

## 2. Colour tokens

The design system calls the action colour "primary". The code keeps the existing name `brand`, so existing utilities such as `bg-brand` keep working. Rows marked "(new)" do not exist in `theme.css` yet.

| Variable                   | Light     | Dark      | Use                                                               |
| -------------------------- | --------- | --------- | ----------------------------------------------------------------- |
| `--brand`                  | `#17503A` | `#7FD6A8` | Primary action, links, selection ("primary" in the design system) |
| `--brand-hover`            | `#0F3D2B` | `#A3E4C2` | Hover on brand                                                    |
| `--brand-disabled`         | `#9DB8AB` | `#3F6B55` | Disabled brand fill                                               |
| `--brand-border`           | `#A9CDBB` | `#2F6B4F` | Border of brand-tinted elements                                   |
| `--brand-soft`             | `#E3F0E9` | `#173326` | Active nav item, selected row, chart fill                         |
| `--brand-soft-strong`      | `#D0E6DA` | `#1F4633` | Stronger brand tint                                               |
| `--brand-fg`               | `#0F3D2B` | `#A3E4C2` | Text on brand-soft                                                |
| `--secondary (new)`        | `#6B4FD8` | `#B5A4FF` | Goals, projections, highlights. Never a button colour             |
| `--secondary-soft (new)`   | `#ECE8FC` | `#2A2350` | Behind goal and projection chips                                  |
| `--surface`                | `#FFFFFF` | `#161D19` | Cards, tables, inputs                                             |
| `--surface-sunken`         | `#F6F5F1` | `#0E1411` | Page background ("ground")                                        |
| `--surface-muted`          | `#EEEDE7` | `#1E2722` | Hover, disabled, progress track                                   |
| `--surface-nav (new)`      | `#FBFAF7` | `#121915` | Sidebar and phone tab bar                                         |
| `--surface-inverse`        | `#15201B` | `#EDF1EE` | Tooltips                                                          |
| `--surface-inverse-raised` | `#23302A` | `#D5DCD7` | Raised element on inverse                                         |
| `--border-subtle`          | `#E9E7E0` | `#232D27` | Row dividers ("rule")                                             |
| `--border-default`         | `#DAD7CE` | `#2E3A33` | Card and table edges                                              |
| `--border-control (new)`   | `#8F8C82` | `#6C7A72` | Inputs and secondary buttons                                      |
| `--border-strong`          | `#7A8078` | `#8B978F` | Rule above total rows                                             |
| `--fg`                     | `#15201B` | `#EDF1EE` | Figures and primary text                                          |
| `--fg-strong`              | `#2A3630` | `#D5DCD7` | Emphasised secondary text                                         |
| `--fg-muted`               | `#535C56` | `#A9B4AD` | Labels, column headers                                            |
| `--fg-subtle`              | `#667069` | `#8A968E` | Captions, timestamps                                              |
| `--fg-faint`               | `#9BA39D` | `#5E6A63` | Placeholders and resting icons only                               |
| `--fg-disabled`            | `#B9BEB9` | `#4A554F` | Disabled text                                                     |
| `--fg-inverted`            | `#FFFFFF` | `#0E1411` | Text on brand and danger fills                                    |
| `--gain (new)`             | `#1A7F4B` | `#5FD39A` | Positive change                                                   |
| `--gain-soft (new)`        | `#E1F3E8` | `#153324` | Behind gain chips                                                 |
| `--loss (new)`             | `#C2372B` | `#FF8F85` | Negative change                                                   |
| `--loss-soft (new)`        | `#FBE7E4` | `#3D1A17` | Behind loss chips                                                 |
| `--flat (new)`             | `#535C56` | `#A9B4AD` | No change                                                         |
| `--success`                | `#1A7F4B` | `#5FD39A` | Saved, synced                                                     |
| `--success-fg`             | `#166B40` | `#8BE0B5` |                                                                   |
| `--success-soft`           | `#E1F3E8` | `#153324` |                                                                   |
| `--success-soft-strong`    | `#CBE9D6` | `#1D4731` |                                                                   |
| `--success-border`         | `#9FD3B4` | `#2C6B48` |                                                                   |
| `--warning`                | `#B87503` | `#F0B34A` | Icons and fills                                                   |
| `--warning-fg`             | `#8A5300` | `#F5C876` | Warning text                                                      |
| `--warning-soft`           | `#FBF0D9` | `#33260C` |                                                                   |
| `--warning-soft-strong`    | `#F6E2B3` | `#4A3711` |                                                                   |
| `--warning-border`         | `#E8C97A` | `#7A5A1A` |                                                                   |
| `--danger`                 | `#C2372B` | `#FF8F85` | Errors, destructive actions                                       |
| `--danger-fg`              | `#A32C22` | `#FFB0A8` |                                                                   |
| `--danger-soft`            | `#FBE7E4` | `#3D1A17` |                                                                   |
| `--danger-soft-strong`     | `#F6D0CB` | `#55231F` |                                                                   |
| `--danger-border`          | `#EBA9A1` | `#8A3A33` |                                                                   |
| `--info`                   | `#2F7FB8` | `#6FB4E6` |                                                                   |
| `--info-fg`                | `#23618E` | `#9CCBEE` |                                                                   |
| `--info-soft`              | `#E6F0F8` | `#142A3A` |                                                                   |
| `--info-soft-strong`       | `#D0E3F2` | `#1B3A50` |                                                                   |
| `--info-border`            | `#A6CBE6` | `#2E5F82` |                                                                   |
| `--focus-ring`             | `#17503A` | `#7FD6A8` | 2px ring on every control                                         |
| `--viz-1 (new)`            | `#2E8B62` | `#5FC796` | Chart: savings                                                    |
| `--viz-2 (new)`            | `#6B4FD8` | `#B5A4FF` | Chart: investments                                                |
| `--viz-3 (new)`            | `#D9952B` | `#EDB95A` | Chart: pension                                                    |
| `--viz-4 (new)`            | `#2F7FB8` | `#6FB4E6` | Chart: property                                                   |
| `--viz-5 (new)`            | `#D9644E` | `#F08E7B` | Chart: other assets                                               |
| `--viz-6 (new)`            | `#8A9189` | `#7C877F` | Chart: debt                                                       |
| `--chart-grid (new)`       | `#E9E7E0` | `#232D27` | Horizontal gridlines                                              |
| `--chart-axis (new)`       | `#667069` | `#8A968E` | Axis labels                                                       |

Rules:

- Never use raw hex values or raw Tailwind palette classes in components. Use the tokens.
- Amounts that went up or down use `gain` / `loss` / `flat`, never `brand` or `success`.
- `secondary` is only for goals, projections and highlights.
- Chart colours are fixed per asset class: `viz-1` savings, `viz-2` investments, `viz-3` pension, `viz-4` property, `viz-5` other assets, `viz-6` debt.

## 3. Type

One family: Geist (variable, weights 400 to 600). No monospace. Every number that can be compared with another uses the `font-numeric` utility (tabular numerals) and is right-aligned in columns. Labels are sentence case; no uppercase, no letter-spaced labels.

| Style           | Size / line height                    | Weight | Letter spacing | Use                                                                       |
| --------------- | ------------------------------------- | ------ | -------------- | ------------------------------------------------------------------------- |
| `figure-hero`   | 30px / 36px (34px / 40px below 640px) | 600    | -0.02em        | The one headline figure of a page                                         |
| `figure-lg`     | 20px / 24px                           | 600    | -0.01em        | Stat cards                                                                |
| `figure-md`     | 14px / 20px                           | 500    | 0              | Totals                                                                    |
| `figure-cell`   | 13px / 18px                           | 400    | 0              | Table cells, right-aligned                                                |
| `title-page`    | 20px / 28px                           | 600    | -0.01em        | Page title                                                                |
| `title-section` | 15px / 20px                           | 600    | 0              | Card and dialog titles                                                    |
| `body`          | 14px / 20px (15px / 20px below 640px) | 400    | 0              | Prose                                                                     |
| `cell`          | 13px / 18px                           | 400    | 0              | Tables and controls                                                       |
| `label`         | 12px / 16px                           | 500    | 0              | Field labels, column headers, stat labels. Sentence case, `text-fg-muted` |
| `caption`       | 12px / 16px                           | 400    | 0              | Captions. 11px is the floor, for badges and tab-bar labels only           |

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

| Token          | Value | Use                                           |
| -------------- | ----- | --------------------------------------------- |
| `rounded-sm`   | 4px   | Badges and chips                              |
| `rounded-md`   | 6px   | Buttons and inputs                            |
| `rounded-lg`   | 10px  | Cards, dialogs, menus, touch buttons          |
| `rounded-xl`   | 12px  | Cards on phone                                |
| `rounded-full` | 999px | Avatars, status dots and progress meters only |

- Borders are always 1px. Table rows are square.
- Cards have a border and **no shadow**. Only menus/tooltips (`shadow-popover`: `0 4px 12px rgb(15 20 18 / 0.12)`, dark `0 4px 12px rgb(0 0 0 / 0.5)`) and dialogs (`shadow-overlay`: `0 16px 40px rgb(15 20 18 / 0.2)`, dark `0 16px 40px rgb(0 0 0 / 0.6)`) cast a shadow.

## 6. Motion

`motion-fast` 100ms (hover, press), `motion-base` 160ms (menus, dialogs), easing `cubic-bezier(0.2, 0, 0, 1)`. No scale or bounce. Figures never count up.

## 7. Content rules

- Sentence case everywhere: "Add transaction".
- Buttons name the action and its object: "Delete account". One primary button per view.
- Currency appears once: in the cell ("€ 1,250.00") or in the column header ("Balance (EUR)"), not both. Two decimals in tables. Use a true minus sign (U+2212) for negatives.
- Dates read "01 Oct 2026".
- Gain: `▲ +2,418.20` or `+1.84%`. Loss: `▼ −612.75` or `−0.43%`. Flat: `– 0.00`.

## 8. Logo

A rounded-square Q with a round-capped tail, one colour (evergreen on light, mint on dark), never a gradient:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect x="9" y="8" width="13" height="13" rx="4.5" stroke="currentColor" stroke-width="3"/>
  <path d="M18 17 L25 24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
</svg>
```

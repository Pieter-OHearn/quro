# Design Tokens

Quro uses semantic CSS variables defined in
[`packages/frontend/src/styles/theme.css`](../packages/frontend/src/styles/theme.css)
to drive Tailwind utility classes. The goal is that shared UI primitives and
feature components describe **intent** (`bg-brand`, `text-fg-muted`,
`border-border-subtle`) rather than raw palette values (`bg-indigo-600`,
`text-slate-500`, `border-slate-100`).

This document is short on purpose: read the token block in `theme.css` for the
full list. This page covers when to use which token group and the rules for
adding new ones.

## Token groups

| Group          | Tokens                                                                                       | Use for                                                |
| -------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Brand**      | `brand`, `brand-hover`, `brand-disabled`, `brand-border`, `brand-soft*`, `brand-fg`          | Primary buttons, active states, brand-tinted surfaces  |
| **Surface**    | `surface`, `surface-sunken`, `surface-muted`, `surface-inverse*`                             | Card / panel backgrounds, page bg, hover bg, dark pill |
| **Border**     | `border-subtle`, `border-default`, `border-strong`                                           | Dividers, card borders, control outlines               |
| **Foreground** | `fg`, `fg-strong`, `fg-muted`, `fg-subtle`, `fg-faint`, `fg-disabled`, `fg-inverted`         | Text and icon color                                    |
| **Status**     | `success`, `warning`, `danger`, `info` (each with `-fg`, `-soft`, `-soft-strong`, `-border`) | Badges, alerts, error states, validation messages      |
| **Focus**      | `focus-ring`                                                                                 | `focus:ring-focus-ring` on interactive elements        |
| **Shadow**     | `shadow-card`, `shadow-popover`, `shadow-overlay`, `shadow-brand`                            | Elevation tiers                                        |
| **Motion**     | `duration-fast` / `-base` / `-slow`, `ease-standard`, `ease-emphasized`                      | `transition-*` and `duration-*` utilities              |
| **Numeric**    | `font-numeric` utility class                                                                 | Any money / numeric column that must align vertically  |

## Rules

1. **In shared primitives** (anything under `packages/frontend/src/components/ui/`):
   use semantic tokens. Do not add raw Tailwind palette utilities like
   `bg-indigo-600` or `text-slate-500` when a token covers the use case.
2. **In feature components:** existing raw-palette usage is fine and does not
   need to migrate in a single pass. New shared primitives **must** use tokens
   from day one.
3. **Need a color that isn't covered?** Add a token to `theme.css` first, then
   use it. Don't reach for an ad-hoc Tailwind class.
4. **Visual baseline:** the current Quro look is the baseline. Token values map
   to the existing palette — they do not redesign the app. Designers can tune
   values later in `theme.css` without code changes.
5. **Border naming:** raw variables are named `--border-*`, but Tailwind color
   utilities include the utility prefix, so use classes like
   `border-border-default` and `border-border-subtle`.

## Adding a new token

1. Add the raw variable on `:root` in `theme.css`.
2. Map it inside the `@theme inline` block under the right namespace
   (`--color-*` for colors, `--shadow-*` for shadows, `--duration-*` /
   `--ease-*` for motion, `--radius-*` for radius) so it becomes a Tailwind
   utility.
3. Use it from primitives and update this doc if it introduces a new group.

## Dark mode

Quro does not have a dark mode today. When it is added, override the same raw
variables under a `.dark { … }` block in `theme.css` and toggle the class on
the document root — every token automatically picks up the new value at
runtime, so no component code has to change.

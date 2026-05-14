/**
 * Shared UI primitives.
 *
 * Style with semantic design tokens (e.g. `bg-brand`, `text-fg-muted`,
 * `border-border-subtle`, `shadow-card`) defined in
 * `src/styles/theme.css`. Do not add raw Tailwind palette utilities like
 * `bg-indigo-600` or `text-slate-500` to primitives — extend `theme.css`
 * with a new token instead. See `docs/design-tokens.md` for the policy.
 */
export * from './atoms';
export * from './molecules';
export * from './organisms';
export * from './templates';

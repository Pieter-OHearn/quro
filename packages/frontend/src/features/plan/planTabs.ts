/**
 * The tabs of the Plan page. A new tab is one entry here and one case in `PlanPage`: the strip, the
 * `?tab=` link, the arrow keys and the panel wiring all read this list.
 */
export const PLAN_TABS = [
  { value: 'runway', label: 'Runway' },
  { value: 'exposure', label: 'Exposure' },
] as const;

export type PlanTab = (typeof PLAN_TABS)[number]['value'];

export const DEFAULT_PLAN_TAB: PlanTab = 'runway';

/** The tab a `?tab=` value names; anything else opens the default one. */
export function resolvePlanTab(value: string | null): PlanTab {
  return PLAN_TABS.find((tab) => tab.value === value)?.value ?? DEFAULT_PLAN_TAB;
}

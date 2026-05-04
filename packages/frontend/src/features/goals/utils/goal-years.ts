const GOAL_YEAR_OPTION_COUNT = 6;

export function getCurrentGoalYear(now = new Date()): number {
  return now.getFullYear();
}

export function buildGoalYearOptions(now = new Date()): string[] {
  const currentYear = getCurrentGoalYear(now);
  return Array.from({ length: GOAL_YEAR_OPTION_COUNT }, (_, index) => String(currentYear + index));
}

export function buildDefaultGoalDeadline(now = new Date()): string {
  return `Dec ${getCurrentGoalYear(now)}`;
}

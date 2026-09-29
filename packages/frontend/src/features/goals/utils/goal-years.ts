export function getCurrentGoalYear(now = new Date()): number {
  return now.getFullYear();
}

export function buildDefaultGoalDeadline(now = new Date()): string {
  return `Dec ${getCurrentGoalYear(now)}`;
}

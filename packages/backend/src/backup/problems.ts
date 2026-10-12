const SHOWN_PROBLEMS = 5;

/** The first few problems, and how many more there are, for a one-line message. */
export function summarizeProblems(problems: readonly string[]): string {
  const shown = problems.slice(0, SHOWN_PROBLEMS).join('; ');
  const more = problems.length - SHOWN_PROBLEMS;
  return more > 0 ? `${shown} and ${more} more` : shown;
}

/** The first few items of a list, for a one-line message. */
export function firstFew(items: readonly string[]): string {
  return summarizeProblems(items).replaceAll('; ', ', ');
}

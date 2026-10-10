// What Quro runs on. `quro migrate` and `quro doctor` check these before anything changes, so an
// unsupported host or database stops with a clear message instead of failing half way.

/** PostgreSQL majors the schema and the bundled client tools are tested against. */
export const SUPPORTED_POSTGRES_MAJORS = { oldest: 16, newest: 18 } as const;

/** Release images are built for these; `darwin` is a development checkout. */
export const SUPPORTED_PLATFORMS = ['linux', 'darwin'] as const;
export const SUPPORTED_ARCHITECTURES = ['x64', 'arm64'] as const;

/** Oldest Bun release the backend supports; the image ships the version in `.bun-version`. */
export const MINIMUM_BUN_VERSION = '1.4.0';

export type RuntimeFacts = { platform: string; arch: string; bunVersion: string };

export function currentRuntime(): RuntimeFacts {
  return { platform: process.platform, arch: process.arch, bunVersion: Bun.version };
}

function versionParts(version: string): number[] {
  return version
    .split('-')[0]!
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

/** Whether `version` is the same as or newer than `minimum` (major.minor.patch). */
export function isAtLeast(version: string, minimum: string): boolean {
  const have = versionParts(version);
  const need = versionParts(minimum);
  for (let index = 0; index < need.length; index += 1) {
    const difference = (have[index] ?? 0) - need[index]!;
    if (difference !== 0) return difference > 0;
  }
  return true;
}

/** Problems with the host and runtime, as sentences; empty when supported. */
export function runtimeProblems(facts: RuntimeFacts = currentRuntime()): string[] {
  const problems: string[] = [];
  if (!(SUPPORTED_PLATFORMS as readonly string[]).includes(facts.platform)) {
    problems.push(`The operating system ${facts.platform} is not supported; use Linux.`);
  }
  if (!(SUPPORTED_ARCHITECTURES as readonly string[]).includes(facts.arch)) {
    problems.push(`The CPU architecture ${facts.arch} is not supported; use amd64 or arm64.`);
  }
  if (!isAtLeast(facts.bunVersion, MINIMUM_BUN_VERSION)) {
    problems.push(
      `Bun ${facts.bunVersion} is older than ${MINIMUM_BUN_VERSION}; run the commands from the Quro backend image.`,
    );
  }
  return problems;
}

/** The problem with a PostgreSQL server major, or null when it is supported. */
export function postgresMajorProblem(major: number): string | null {
  const { oldest, newest } = SUPPORTED_POSTGRES_MAJORS;
  if (major >= oldest && major <= newest) return null;
  return `PostgreSQL ${major} is not supported; use PostgreSQL ${oldest} to ${newest} (${newest} is the baseline).`;
}

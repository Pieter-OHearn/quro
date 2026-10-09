import {
  ConfigError,
  formatProblems,
  loadConfig,
  type Config,
  type ConfigProblem,
  type LoadedConfig,
  type SectionName,
} from './load';

export * from './load';
export { Secret } from './secret';
export { DEFAULT_CORS_ORIGINS, type NodeEnvironment } from './settings';

// This module is the only place that reads `process.env` (enforced by lint). Everything else asks
// for the parsed, frozen `Config`.

let loaded: LoadedConfig | undefined;

/** The configuration, parsed once from the process environment on first use. */
export function getConfig(): Config {
  loaded ??= loadConfig(process.env);
  return loaded.config;
}

/**
 * Parses the environment again. Tests that change `process.env` call this; the application
 * never does, so its configuration cannot change after boot.
 */
export function reloadConfig(): Config {
  loaded = loadConfig(process.env);
  return loaded.config;
}

export function isTestEnvironment(): boolean {
  return getConfig().runtime.environment === 'test';
}

/** What each kind of process needs. Settings of other sections are not checked for it. */
export const PROFILES = {
  server: ['runtime', 'web', 'runtimeDatabase', 'documents', 'bunq', 'pensionImport', 'tracing'],
  worker: ['runtime', 'runtimeDatabase', 'documents', 'pensionImport', 'tracing'],
  cli: ['runtimeDatabase'],
  migrate: ['adminDatabase', 'runtimeDatabase'],
  backup: ['adminDatabase', 'tools'],
  maintenance: ['adminDatabase', 'runtimeDatabase', 'tools', 'maintenance'],
  seed: ['runtimeDatabase', 'demo'],
} as const satisfies Record<string, readonly SectionName[]>;

export type Profile = keyof typeof PROFILES;

/** Every problem in the sections a profile needs, without duplicates. */
export function profileProblems(profile: Profile): ConfigProblem[] {
  getConfig();
  const seen = new Set<string>();
  const problems: ConfigProblem[] = [];
  for (const section of PROFILES[profile] as readonly SectionName[]) {
    for (const problem of loaded!.problems[section]) {
      const key = `${problem.setting}\n${problem.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push(problem);
    }
  }
  return problems;
}

/** Throws one `ConfigError` listing every problem the profile has. */
export function assertConfig(profile: Profile): Config {
  const problems = profileProblems(profile);
  if (problems.length > 0) throw new ConfigError(problems);
  return getConfig();
}

/**
 * Validates the configuration for a process at startup. On a problem it prints the full list,
 * which names settings and never their values, and exits with code 2 (settings invalid).
 */
export function bootConfig(profile: Profile): Config {
  try {
    const config = assertConfig(profile);
    for (const notice of config.notices)
      console.warn(`[config] ${notice.setting} ${notice.message}`);
    return config;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(formatProblems(error.problems));
    process.exit(error.exitCode);
  }
}

/** The environment passed to child processes such as `pg_dump`. */
export function childProcessEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

// Release versions (`v0.8.0`, `v1.0.0-rc.2`, the VERSION file; see lib/buildInfo.ts) and their
// order, so a restore can refuse an archive written by a newer release.

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/;

export type AppVersion = {
  major: number;
  minor: number;
  patch: number;
  /** Release candidate number, or null for a release. */
  rc: number | null;
};

/** Parses `v1.2.3` or `v1.2.3-rc.4`; null for anything else. */
export function parseAppVersion(text: string): AppVersion | null {
  const match = VERSION_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, major, minor, patch, rc] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    rc: rc === undefined ? null : Number(rc),
  };
}

/** Negative when `a` is older than `b`, zero when equal, positive when newer. A release outranks its candidates. */
export function compareAppVersions(a: AppVersion, b: AppVersion): number {
  for (const part of ['major', 'minor', 'patch'] as const) {
    if (a[part] !== b[part]) return a[part] - b[part];
  }
  if (a.rc === null || b.rc === null) return Number(a.rc === null) - Number(b.rc === null);
  return a.rc - b.rc;
}

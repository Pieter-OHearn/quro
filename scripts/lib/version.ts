export type ReleaseType = 'major' | 'minor' | 'patch' | 'prerelease';

export type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: number;
};

const VERSION_REGEX = /^v(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/i;

export function parseVersion(raw: string): ParsedVersion | null {
  const match = raw.trim().match(VERSION_REGEX);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? undefined : Number(match[4]),
  };
}

export function formatVersion(parsed: ParsedVersion): string {
  const base = `v${parsed.major}.${parsed.minor}.${parsed.patch}`;
  return parsed.prerelease !== undefined ? `${base}-rc.${parsed.prerelease}` : base;
}

export function compareVersions(aRaw: string, bRaw: string): number {
  const a = parseVersion(aRaw);
  const b = parseVersion(bRaw);
  if (!a || !b) throw new Error('Cannot compare invalid versions');

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] > b[key]) return 1;
    if (a[key] < b[key]) return -1;
  }

  if (a.prerelease === undefined && b.prerelease === undefined) return 0;
  if (a.prerelease === undefined) return 1; // release > prerelease
  if (b.prerelease === undefined) return -1;
  if (a.prerelease > b.prerelease) return 1;
  if (a.prerelease < b.prerelease) return -1;
  return 0;
}

export function incrementVersion(raw: string, releaseType: ReleaseType): ParsedVersion | null {
  const parsed = parseVersion(raw);
  if (!parsed) return null;
  const next: ParsedVersion = { ...parsed };

  switch (releaseType) {
    case 'major':
      next.major += 1;
      next.minor = 0;
      next.patch = 0;
      next.prerelease = undefined;
      break;
    case 'minor':
      next.minor += 1;
      next.patch = 0;
      next.prerelease = undefined;
      break;
    case 'patch':
      next.patch += 1;
      next.prerelease = undefined;
      break;
    case 'prerelease':
      if (next.prerelease === undefined) {
        next.prerelease = 0;
      } else {
        next.prerelease += 1;
      }
      break;
    default:
      return null;
  }

  return next;
}

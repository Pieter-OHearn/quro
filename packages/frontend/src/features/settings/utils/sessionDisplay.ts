// First match wins: Edge and Opera also announce Chrome, Chrome also announces Safari, Android
// also announces Linux and iOS also announces Mac OS X.
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\b(?:Mac OS X|Macintosh)\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

function firstMatch(value: string, patterns: ReadonlyArray<readonly [RegExp, string]>) {
  return patterns.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

/** A short "Browser on System" label for a stored user agent. */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown browser';
  const browser = firstMatch(userAgent, BROWSERS);
  const system = firstMatch(userAgent, SYSTEMS);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown browser';
}

export function formatSessionTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown';
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

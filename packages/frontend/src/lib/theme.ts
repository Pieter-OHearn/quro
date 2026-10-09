/**
 * Light / dark / system theme, stored in this browser only (no account setting).
 *
 * `public/theme-init.js` applies the stored choice before the first paint, so a reload never
 * shows the wrong theme; keep its storage key, values and colours in step with this file
 * (`theme.test.ts` runs both against the same cases).
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const THEME_STORAGE_KEY = 'quro-theme';
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

/** Browser chrome colour per theme: the page background (`--surface-sunken`). */
export const THEME_COLORS: Readonly<Record<ResolvedTheme, string>> = {
  light: '#F6F5F1',
  dark: '#0E1411',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/** The stored preference, or `system` when nothing valid is stored or storage is unavailable. */
export function getStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Remembers the preference in this browser; does nothing when storage is unavailable. */
export function storeTheme(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private mode or blocked storage: the choice applies to this page only.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(SYSTEM_DARK_QUERY).matches;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

/** Puts the `dark` class on <html> (or removes it) and matches the browser chrome colour. */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const theme = resolveTheme(preference);
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  return theme;
}

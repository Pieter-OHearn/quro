import { useEffect, useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME_PREFERENCE,
  SYSTEM_DARK_QUERY,
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  storeTheme,
  type ThemePreference,
} from '@/lib/theme';

// One preference for the whole page, so every component using the hook agrees and only the
// current choice listens to the system setting.
const listeners = new Set<() => void>();
let currentPreference: ThemePreference | undefined;

function notify(preference: ThemePreference): void {
  currentPreference = preference;
  for (const listener of listeners) listener();
}

// Another tab changed (or cleared) the stored choice: follow it here too.
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
  const stored = getStoredTheme();
  if (stored !== currentPreference) notify(stored);
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): ThemePreference {
  currentPreference ??= getStoredTheme();
  return currentPreference;
}

function getServerSnapshot(): ThemePreference {
  return DEFAULT_THEME_PREFERENCE;
}

function setPreference(preference: ThemePreference): void {
  storeTheme(preference);
  notify(preference);
}

/**
 * The theme preference and its setter. Applies the theme to the document, follows a choice made
 * in another tab and, while the preference is `system`, follows changes of the OS setting live.
 */
export function useTheme(): {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
} {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia(SYSTEM_DARK_QUERY);
    const followSystem = () => {
      applyTheme('system');
    };
    query.addEventListener('change', followSystem);
    return () => {
      query.removeEventListener('change', followSystem);
    };
  }, [preference]);

  return { preference, setPreference };
}

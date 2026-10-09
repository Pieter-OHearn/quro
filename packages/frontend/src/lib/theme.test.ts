import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  SYSTEM_DARK_QUERY,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  storeTheme,
} from './theme';

type FakeBrowserOptions = {
  /** Stored value; `throw` makes every storage access fail, as in some private modes. */
  stored?: string | null | 'throw';
  /** OS setting; `unsupported` removes `matchMedia`. */
  systemDark?: boolean | 'unsupported';
  /** Whether <html> already has the `dark` class. */
  startDark?: boolean;
};

type FakeBrowser = {
  window: unknown;
  document: unknown;
  storage: Map<string, string>;
  isDark: () => boolean;
  themeColor: () => string;
};

function createFakeBrowser({
  stored = null,
  systemDark = false,
  startDark = false,
}: FakeBrowserOptions = {}): FakeBrowser {
  const classes = new Set<string>(startDark ? ['dark'] : []);
  const storage = new Map<string, string>();
  if (typeof stored === 'string' && stored !== 'throw') storage.set(THEME_STORAGE_KEY, stored);
  const meta = { content: THEME_COLORS.light };
  const blocked = () => {
    throw new Error('storage blocked');
  };
  const localStorage =
    stored === 'throw'
      ? { getItem: blocked, setItem: blocked }
      : {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        };
  const matchMedia =
    systemDark === 'unsupported'
      ? undefined
      : (query: string) => ({ matches: query === SYSTEM_DARK_QUERY && systemDark });

  return {
    window: { localStorage, matchMedia },
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, force: boolean) => {
            if (force) classes.add(name);
            else classes.delete(name);
            return force;
          },
        },
      },
      querySelector: (selector: string) =>
        selector === 'meta[name="theme-color"]'
          ? {
              setAttribute: (name: string, value: string) => {
                if (name === 'content') meta.content = value;
              },
            }
          : null,
    },
    storage,
    isDark: () => classes.has('dark'),
    themeColor: () => meta.content,
  };
}

const globals = globalThis as Record<string, unknown>;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

function install(browser: FakeBrowser): FakeBrowser {
  Object.defineProperty(globalThis, 'window', { value: browser.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: browser.document, configurable: true });
  return browser;
}

afterEach(() => {
  for (const [name, descriptor] of [
    ['window', originalWindow],
    ['document', originalDocument],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globals[name];
  }
});

describe('applyTheme', () => {
  test.each([
    ['light', false, true, false],
    ['light', true, true, false],
    ['dark', false, false, true],
    ['dark', true, false, true],
    ['system', true, false, true],
    ['system', false, true, false],
  ] as const)(
    '%s with the OS dark=%p and the page dark=%p leaves dark=%p',
    (preference, systemDark, startDark, expectDark) => {
      const browser = install(createFakeBrowser({ systemDark, startDark }));

      const resolved = applyTheme(preference);

      expect(resolved).toBe(expectDark ? 'dark' : 'light');
      expect(browser.isDark()).toBe(expectDark);
      expect(browser.themeColor()).toBe(expectDark ? '#0E1411' : '#F6F5F1');
    },
  );

  test('system falls back to light where the browser has no matchMedia', () => {
    const browser = install(createFakeBrowser({ systemDark: 'unsupported', startDark: true }));

    expect(applyTheme('system')).toBe('light');
    expect(browser.isDark()).toBe(false);
  });
});

describe('stored preference', () => {
  test('round-trips every preference under the quro-theme key', () => {
    const browser = install(createFakeBrowser());
    for (const preference of ['light', 'dark', 'system'] as const) {
      storeTheme(preference);
      expect(browser.storage.get('quro-theme')).toBe(preference);
      expect(getStoredTheme()).toBe(preference);
    }
  });

  test('defaults to system when nothing valid is stored or storage is blocked', () => {
    install(createFakeBrowser());
    expect(getStoredTheme()).toBe('system');
    install(createFakeBrowser({ stored: 'sepia' }));
    expect(getStoredTheme()).toBe('system');
    install(createFakeBrowser({ stored: 'throw' }));
    expect(getStoredTheme()).toBe('system');
    expect(() => storeTheme('dark')).not.toThrow();
  });
});

describe('public/theme-init.js', () => {
  const source = readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8');
  const runInitScript = (browser: FakeBrowser) => {
    new Function('window', 'document', source)(browser.window, browser.document);
  };

  test.each([
    { stored: 'light', systemDark: true, startDark: true },
    { stored: 'dark', systemDark: false },
    { stored: 'system', systemDark: true },
    { stored: 'system', systemDark: false, startDark: true },
    { stored: null, systemDark: true },
    { stored: null, systemDark: false },
    { stored: 'sepia', systemDark: true },
    { stored: 'throw', systemDark: true },
    { stored: null, systemDark: 'unsupported', startDark: true },
  ] satisfies FakeBrowserOptions[])('agrees with applyTheme for %o', (options) => {
    const expected = install(createFakeBrowser(options));
    applyTheme(getStoredTheme());

    const actual = createFakeBrowser(options);
    runInitScript(actual);

    expect(actual.isDark()).toBe(expected.isDark());
    expect(actual.themeColor()).toBe(expected.themeColor());
  });
});

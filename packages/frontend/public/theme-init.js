// Applies the stored theme before the first paint, so a reload never flashes the wrong theme.
// A same-origin file rather than an inline script: the bundled nginx Content-Security-Policy
// allows scripts from 'self' only. Mirrors resolveTheme/applyTheme in src/lib/theme.ts (same
// storage key, values and colours); src/lib/theme.test.ts runs both against the same cases.
(function applyStoredTheme() {
  let preference = 'system';
  try {
    preference = window.localStorage.getItem('quro-theme') || 'system';
  } catch {
    // Storage unavailable: follow the system setting.
  }
  const dark =
    preference === 'dark' ||
    (preference !== 'light' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', dark ? '#0E1411' : '#F6F5F1');
})();

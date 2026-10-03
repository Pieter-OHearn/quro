import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { DATA_COLORS, dataColorToken } from './dataColors';

test('categorical tokens retain the persisted swatch values', () => {
  const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
  for (const [name, value] of Object.entries(DATA_COLORS)) {
    expect(theme).toContain(`--data-${name}: ${value};`);
    expect(dataColorToken(value)).toBe(`var(--data-${name})`);
  }
  expect(dataColorToken('#123456')).toBe('#123456');
});

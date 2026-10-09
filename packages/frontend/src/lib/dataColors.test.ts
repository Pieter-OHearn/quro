import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { DATA_COLORS, dataColorToken } from './dataColors';

test('every persisted swatch value maps to a display token that points at a chart colour', () => {
  const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
  for (const [name, value] of Object.entries(DATA_COLORS)) {
    expect(theme).toMatch(new RegExp(`--data-${name}: var\\(--(viz-[1-6]|loss)\\);`));
    expect(dataColorToken(value)).toBe(`var(--data-${name})`);
  }
  expect(dataColorToken('#123456')).toBe('#123456');
});

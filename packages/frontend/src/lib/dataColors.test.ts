import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CATEGORY_COLORS, DATA_COLORS, categoryColorFor, dataColorToken } from './dataColors';

test('every persisted swatch value maps to a display token that points at a chart colour', () => {
  const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
  for (const [name, value] of Object.entries(DATA_COLORS)) {
    expect(theme).toMatch(new RegExp(`--data-${name}: var\\(--(viz-[1-6]|loss)\\);`));
    expect(dataColorToken(value)).toBe(`var(--data-${name})`);
  }
  expect(dataColorToken('#123456')).toBe('#123456');
  expect(dataColorToken(DATA_COLORS.primary.toUpperCase())).toBe('var(--data-primary)');
  expect(dataColorToken('#ABCDEF')).toBe('#ABCDEF');
});

test('category pickers offer the six chart colours, one canonical identity each', () => {
  const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
  const vizOf = (color: string) => {
    const name = Object.entries(DATA_COLORS).find(([, value]) => value === color)?.[0];
    return theme.match(new RegExp(`--data-${name}: var\\(--(viz-[1-6]|loss)\\);`))?.[1];
  };
  expect(CATEGORY_COLORS.map(vizOf)).toEqual([
    'viz-1',
    'viz-2',
    'viz-3',
    'viz-4',
    'viz-5',
    'viz-6',
  ]);
});

test('every legacy DATA_COLORS value selects one of the six offered swatches', () => {
  const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
  for (const [name, value] of Object.entries(DATA_COLORS)) {
    const swatch = categoryColorFor(value);
    expect(CATEGORY_COLORS).toContain(swatch);
    const token = theme.match(new RegExp(`--data-${name}: var\\(--(viz-[1-6]|loss)\\);`))?.[1];
    const swatchName = Object.entries(DATA_COLORS).find(([, v]) => v === swatch)?.[0];
    const swatchToken = theme.match(
      new RegExp(`--data-${swatchName}: var\\(--(viz-[1-6])\\);`),
    )?.[1];
    // A value shows the swatch of its own display colour; loss-coloured values show terracotta.
    expect(swatchToken).toBe(token === 'loss' ? 'viz-4' : token);
  }
  expect(categoryColorFor(DATA_COLORS.alert.toUpperCase())).toBe(DATA_COLORS.property);
  expect(categoryColorFor('#123456')).toBeUndefined();
});

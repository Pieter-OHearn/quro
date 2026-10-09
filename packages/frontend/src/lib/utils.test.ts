import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { cn } from './utils';

const theme = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');
const typeScaleUtilities = [...theme.matchAll(/^@utility (text-[a-z-]+) \{/gm)].map(
  (match) => match[1],
);

describe('cn with the V1 type scale utilities', () => {
  test('theme.css defines the ten type styles of the V1 design', () => {
    expect(typeScaleUtilities).toEqual([
      'text-figure-hero',
      'text-figure-lg',
      'text-figure-md',
      'text-figure-cell',
      'text-title-page',
      'text-title-section',
      'text-body',
      'text-cell',
      'text-label',
      'text-caption',
    ]);
  });

  test.each(typeScaleUtilities)('%s keeps its colour class', (utility) => {
    expect(cn(`${utility} text-fg-muted`)).toBe(`${utility} text-fg-muted`);
    expect(cn('text-danger', utility)).toBe(`text-danger ${utility}`);
  });

  test.each(typeScaleUtilities)('%s and a Tailwind text size replace each other', (utility) => {
    expect(cn('text-sm', utility)).toBe(utility);
    expect(cn(utility, 'text-sm')).toBe('text-sm');
  });
});

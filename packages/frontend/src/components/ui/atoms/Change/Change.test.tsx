import { describe, expect, test } from 'bun:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Change, type ChangeProps } from '@/components/ui';
import { CurrencyContext, type CurrencyContextType } from '@/lib/currencyContextValue';

const MINUS = '\u2212';
const UP_ARROW = '\u25B2';
const DOWN_ARROW = '\u25BC';
const HYPHEN_MINUS = '-';
const NO_BREAK_SPACE = '\u00A0';
const DASHES = ['\u2013', '\u2014'];
const STATUS_COLOUR_CLASSES = ['text-success', 'text-danger', 'text-brand'];
const CHIP_SHAPE = 'rounded-sm px-1.5 py-px';
const TYPE_CLASSES = ['font-numeric', 'text-[13px]', 'leading-[18px]', 'font-medium'];

function render(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

type RenderedText = {
  /** The text a sighted reader sees, without the visually hidden prefix. */
  visible: string;
  /** The text inside `sr-only` elements, or null when there is none. */
  screenReader: string | null;
};

function classList(tag: string): string[] {
  return /\sclass="([^"]*)"/.exec(tag)?.[1].split(' ') ?? [];
}

/** Depth inside an `sr-only` element after reading one tag (0 when outside one). */
function hiddenDepthAfter(depth: number, tag: string): number {
  const closing = tag.startsWith('/');
  if (depth > 0) return closing ? depth - 1 : depth + 1;
  return !closing && classList(tag).includes('sr-only') ? 1 : 0;
}

/**
 * Reads server-rendered markup tag by tag instead of stripping tags with a pattern.
 * React escapes `<` in text, so every `<` in the markup opens a tag.
 */
function readText(markup: string): RenderedText {
  const result: RenderedText = { visible: '', screenReader: null };
  let hiddenDepth = 0;
  let cursor = 0;
  while (cursor < markup.length) {
    const tagStart = markup.indexOf('<', cursor);
    const text = markup.slice(cursor, tagStart === -1 ? markup.length : tagStart);
    if (hiddenDepth > 0 && text) result.screenReader = (result.screenReader ?? '') + text;
    else result.visible += text;
    if (tagStart === -1) break;

    const tagEnd = markup.indexOf('>', tagStart);
    if (tagEnd === -1) throw new Error(`Unclosed tag in rendered markup: ${markup}`);
    hiddenDepth = hiddenDepthAfter(hiddenDepth, markup.slice(tagStart + 1, tagEnd));
    cursor = tagEnd + 1;
  }
  return result;
}

function visibleText(markup: string): string {
  return readText(markup).visible;
}

function screenReaderPrefix(markup: string): string | null {
  return readText(markup).screenReader;
}

type MatrixCase = {
  sign: 'positive' | 'negative' | 'zero';
  value: number;
  text: Record<ChangeProps['format'], string>;
  colour: string;
  chipBackground: string;
  arrow: string | null;
  srPrefix: string;
};

const MATRIX: readonly MatrixCase[] = [
  {
    sign: 'positive',
    value: 2418.2,
    text: { amount: '+2,418.20', percent: '+2,418.20%' },
    colour: 'text-gain',
    chipBackground: 'bg-gain-soft',
    arrow: UP_ARROW,
    srPrefix: 'up ',
  },
  {
    sign: 'negative',
    value: -612.75,
    text: { amount: `${MINUS}612.75`, percent: `${MINUS}612.75%` },
    colour: 'text-loss',
    chipBackground: 'bg-loss-soft',
    arrow: DOWN_ARROW,
    srPrefix: 'down ',
  },
  {
    sign: 'zero',
    value: 0,
    text: { amount: '0.00', percent: '0.00%' },
    colour: 'text-flat',
    chipBackground: 'bg-surface-muted',
    arrow: null,
    srPrefix: 'no change ',
  },
];

const FORMATS: readonly ChangeProps['format'][] = ['amount', 'percent'];
const VARIANTS = ['text', 'chip'] as const;

test('the markup reader separates visible text from screen-reader text', () => {
  expect(
    readText('<span class="a"><i>x</i><span class="b sr-only">up <b>now</b></span>+1</span>'),
  ).toEqual({ visible: 'x+1', screenReader: 'up now' });
  expect(readText('<span>0.00</span>')).toEqual({ visible: '0.00', screenReader: null });
});

describe('Change sign, colour and arrow matrix', () => {
  for (const entry of MATRIX) {
    for (const format of FORMATS) {
      for (const variant of VARIANTS) {
        test(`${entry.sign} ${format} as ${variant}`, () => {
          const markup = render(<Change value={entry.value} format={format} variant={variant} />);

          const arrowShown = format === 'amount' && entry.arrow !== null;
          const expectedText = arrowShown
            ? `${entry.arrow}${entry.text[format]}`
            : entry.text[format];
          expect(visibleText(markup)).toBe(expectedText);
          expect(screenReaderPrefix(markup)).toBe(entry.srPrefix);
          expect(markup).toContain(entry.colour);
          for (const typeClass of TYPE_CLASSES) expect(markup).toContain(typeClass);

          if (arrowShown) {
            expect(markup).toContain(`<span aria-hidden="true">${entry.arrow}</span>`);
          } else {
            expect(markup).not.toContain(UP_ARROW);
            expect(markup).not.toContain(DOWN_ARROW);
          }

          if (variant === 'chip') {
            expect(markup).toContain(CHIP_SHAPE);
            expect(markup).toContain(entry.chipBackground);
          } else {
            expect(markup).not.toContain('rounded-sm');
            expect(markup).not.toContain('bg-');
          }

          for (const statusClass of STATUS_COLOUR_CLASSES) {
            expect(markup).not.toContain(statusClass);
          }
        });
      }
    }
  }
});

describe('Change signs', () => {
  test('uses a true minus sign, never a hyphen-minus, for losses', () => {
    const text = visibleText(render(<Change value={-0.43} format="percent" />));
    expect(text).toBe(`${MINUS}0.43%`);
    expect(text).not.toContain(HYPHEN_MINUS);
  });

  test('renders zero with no sign, arrow or dash in either format', () => {
    for (const format of FORMATS) {
      const markup = render(<Change value={0} format={format} showArrow />);
      const text = visibleText(markup);
      expect(text).toBe(format === 'amount' ? '0.00' : '0.00%');
      for (const mark of ['+', MINUS, HYPHEN_MINUS, UP_ARROW, DOWN_ARROW, ...DASHES]) {
        expect(text).not.toContain(mark);
      }
      expect(markup).toContain('text-flat');
    }
  });

  test('treats negative zero and values that round to 0.00 as no change', () => {
    for (const value of [-0, 0.004, -0.004, 0.0049]) {
      const markup = render(<Change value={value} format="amount" />);
      expect(visibleText(markup)).toBe('0.00');
      expect(screenReaderPrefix(markup)).toBe('no change ');
      expect(markup).toContain('text-flat');
    }
  });

  test('keeps the sign for the smallest change that shows as 0.01', () => {
    expect(visibleText(render(<Change value={0.005} format="amount" showArrow={false} />))).toBe(
      '+0.01',
    );
    expect(visibleText(render(<Change value={-0.006} format="percent" />))).toBe(`${MINUS}0.01%`);
  });
});

describe('Change number formatting', () => {
  test('always shows two decimals and thousands separators', () => {
    expect(
      visibleText(render(<Change value={1234567.891} format="amount" showArrow={false} />)),
    ).toBe('+1,234,567.89');
    expect(visibleText(render(<Change value={1.8} format="percent" />))).toBe('+1.80%');
    expect(visibleText(render(<Change value={-1500} format="percent" />))).toBe(
      `${MINUS}1,500.00%`,
    );
  });

  test('shows the currency when one is given for an amount', () => {
    expect(visibleText(render(<Change value={2418.2} format="amount" currency="EUR" />))).toBe(
      `${UP_ARROW}+€2,418.20`,
    );
    expect(visibleText(render(<Change value={-612.75} format="amount" currency="USD" />))).toBe(
      `${DOWN_ARROW}${MINUS}$612.75`,
    );
  });

  test("follows the signed-in user's number format", () => {
    const context = {
      baseCurrency: 'EUR',
      numberFormat: 'de-DE',
      setBaseCurrency: () => {},
      convertToBase: (amount: number) => amount,
      fmtBase: () => '',
      fmtNative: () => '',
      isForeign: () => false,
      ratesStatus: 'ready',
      ratesUpdatedAt: null,
    } satisfies CurrencyContextType;
    const markup = render(
      <CurrencyContext.Provider value={context}>
        <Change value={-2418.2} format="amount" currency="EUR" showArrow={false} />
        <Change value={1.84} format="percent" />
      </CurrencyContext.Provider>,
    );
    expect(visibleText(markup)).toBe(`${MINUS}2.418,20${NO_BREAK_SPACE}€+1,84%`);
  });
});

describe('Change options', () => {
  test('shows the arrow on percentages only when asked', () => {
    expect(visibleText(render(<Change value={1.84} format="percent" />))).toBe('+1.84%');
    expect(visibleText(render(<Change value={1.84} format="percent" showArrow />))).toBe(
      `${UP_ARROW}+1.84%`,
    );
  });

  test('hides the arrow on amounts when asked', () => {
    const markup = render(<Change value={-612.75} format="amount" showArrow={false} />);
    expect(visibleText(markup)).toBe(`${MINUS}612.75`);
    expect(markup).not.toContain('aria-hidden');
  });

  test('merges a caller class name', () => {
    expect(render(<Change value={1} format="amount" className="ml-2" />)).toContain('ml-2');
  });

  test('reports a value that is not a finite number as unavailable', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const markup = render(<Change value={value} format="percent" showArrow variant="chip" />);
      expect(visibleText(markup)).toBe('Unavailable');
      expect(screenReaderPrefix(markup)).toBeNull();
      expect(markup).toContain('text-flat');
      expect(markup).toContain('bg-surface-muted');
    }
  });
});

/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TxnAmount } from './TxnAmount';

const format = (amount: number) => `€${amount.toFixed(2)}`;

function render(value: number) {
  return renderToStaticMarkup(<TxnAmount value={value} format={format} />);
}

describe('TxnAmount', () => {
  test('money in has a plus sign in the gain colour', () => {
    const markup = render(1250);
    expect(markup).toContain('text-gain');
    expect(markup).toContain('>+€1250.00<');
  });

  test('money out has a true minus sign in the figure colour', () => {
    const markup = render(-1250);
    expect(markup).toContain('text-fg');
    expect(markup).not.toContain('text-gain');
    expect(markup).toContain('>−€1250.00<');
    expect(markup).not.toContain('-€');
  });

  test('an amount that formats as zero has no sign', () => {
    for (const value of [0, -0.001, 0.004]) {
      const markup = render(value);
      expect(markup).not.toContain('text-gain');
      expect(markup).toContain('>€0.00</span>');
    }
  });
});

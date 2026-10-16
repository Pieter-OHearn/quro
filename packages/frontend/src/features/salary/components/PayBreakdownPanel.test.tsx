/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Payslip } from '@quro/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildBreakdownLines } from '../utils/salary-data';
import { PayBreakdownTable } from './PayBreakdownPanel';

const base: Payslip = {
  id: 2,
  month: 'May 2026',
  date: '2026-05-25',
  gross: 5_500,
  tax: 1_400,
  pension: 300,
  net: 3_800,
  bonus: null,
  currency: 'EUR',
  document: null,
};
const earlier: Payslip = { ...base, id: 1, month: 'April 2026', date: '2026-04-25', tax: 1_300 };

const render = (selected: Payslip, compareTo: Payslip | null, convert = (v: number) => v) =>
  renderToStaticMarkup(
    <PayBreakdownTable
      selected={selected}
      compareTo={compareTo}
      lines={buildBreakdownLines(selected, compareTo, convert)}
      baseCurrency="EUR"
      numberFormat="en-US"
      fmtNative={(amount, currency) => `${currency} ${amount.toFixed(2)}`}
    />,
  );

test('the breakdown names both months and reads more tax than before as a loss', () => {
  const markup = render(base, earlier);

  expect(markup).toContain('Gross to take-home pay for May 2026, compared with April 2026, in EUR');
  expect(markup).toContain('vs April 2026');
  expect(markup).toContain('<span class="sr-only">down </span>−€100.00');
  expect(markup).not.toContain('Paid in');
});

test('without a comparison the table has no change column', () => {
  const markup = render(base, null);

  expect(markup).not.toContain('vs ');
  expect(markup).toContain('Take-home pay is gross pay plus any bonus');
});

test('a payslip in another currency keeps its native figures visible', () => {
  const sterling: Payslip = { ...base, currency: 'GBP' };
  const markup = render(sterling, null, (value) => value * 1.18);

  expect(markup).toContain('Paid in GBP: GBP 5500.00 gross, GBP 3800.00 take-home');
  expect(markup).toContain('Converted to EUR at today&#x27;s rate');
});

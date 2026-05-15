/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { Payslip } from '@quro/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { PayslipHistoryTable } from './PayslipHistoryTable';

const payslips: Payslip[] = [
  {
    id: 1,
    month: 'April 2026',
    date: '2026-04-30',
    gross: 5_500,
    tax: 1_400,
    pension: 300,
    net: 3_800,
    bonus: null,
    currency: 'EUR',
    document: null,
  },
  {
    id: 2,
    month: 'May 2026',
    date: '2026-05-31',
    gross: 5_750,
    tax: 1_475,
    pension: 325,
    net: 3_950,
    bonus: 500,
    currency: 'EUR',
    document: null,
  },
];

const fmtBase = (value: number, currency = 'EUR') => `${currency} ${value.toFixed(2)}`;
const noop = () => {};

test('PayslipHistoryTable renders sortable headers and defaults to newest payslip first', () => {
  const markup = renderToStaticMarkup(
    <PayslipHistoryTable
      payslips={[payslips[0], payslips[1]]}
      selected={null}
      fmtBase={fmtBase}
      onSelect={noop}
      onAdd={noop}
      onEdit={noop}
    />,
  );

  expect(markup).toContain('aria-sort="descending"');
  expect(markup).toContain('aria-label="Sort by Gross"');
  expect(markup.indexOf('May 2026')).toBeLessThan(markup.indexOf('April 2026'));
});

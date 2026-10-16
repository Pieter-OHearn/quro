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
      baseCurrency="EUR"
      convertToBase={(value) => value}
      onSelect={noop}
      onAdd={noop}
      onEdit={noop}
    />,
  );

  expect(markup).toContain('aria-sort="descending"');
  expect(markup).toContain('aria-label="Sort by gross"');
  expect(markup.indexOf('May 2026')).toBeLessThan(markup.indexOf('April 2026'));
});

const render = (rows: Payslip[], selected: Payslip | null = null) =>
  renderToStaticMarkup(
    <PayslipHistoryTable
      payslips={rows}
      selected={selected}
      fmtBase={fmtBase}
      baseCurrency="EUR"
      convertToBase={(value) => value}
      onSelect={noop}
      onAdd={noop}
      onEdit={noop}
    />,
  );

test('PayslipHistoryTable shows a bonus column and a year total that adds up', () => {
  const markup = render(payslips);

  expect(markup).toContain('aria-label="Sort by bonus"');
  expect(markup).toContain('data-total');
  expect(markup).toContain('2 payslips in EUR');
  // Gross 5,500 + 5,750, bonus 500, tax 1,400 + 1,475, pension 300 + 325, net 3,800 + 3,950.
  expect(markup).toContain('EUR 11250.00');
  expect(markup).toContain('EUR 500.00');
  expect(markup).toContain('EUR 7750.00');
  expect(markup).toContain('2,875.00');
  expect(markup).toContain('625.00');
});

test('PayslipHistoryTable keeps negative corrections and very large amounts exact', () => {
  const big: Payslip = {
    ...payslips[0],
    id: 9,
    gross: 9_999_999_999.99,
    tax: -1_234.56,
    net: 10_000_001_234.55 - 300,
  };
  const markup = render([big]);

  expect(markup).toContain('9999999999.99');
  // A negative deduction is a correction, so it reads as a gain.
  expect(markup).toContain('+€1,234.56');
});

test('PayslipHistoryTable marks the selected row and lists the phone-only columns under it', () => {
  const markup = render(payslips, payslips[1]);

  expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
  // Bonus, tax and pension are hidden from the phone row, so one detail row repeats them.
  expect(markup.match(/data-phone-detail/g)).toHaveLength(1);
  expect(markup).toContain('<dt class="text-label text-fg-muted">Pension</dt>');
  expect(render(payslips)).not.toContain('<dt class="text-label text-fg-muted">Pension</dt>');
});

test('PayslipHistoryTable keeps a long month label in its own cell and shows the empty state', () => {
  const long = { ...payslips[0], month: 'A very long payslip label '.repeat(8).trim() };

  expect(render([long])).toContain(long.month);
  expect(render([])).toContain('No payslips yet.');
  expect(render([])).not.toContain('data-total');
});

test('PayslipHistoryTable pages a 10,000-row fixture but totals every payslip', () => {
  const fixture: Payslip[] = Array.from({ length: 10_000 }, (_, index) => ({
    ...payslips[0],
    id: index + 1,
    month: `Fixture ${index + 1}`,
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    gross: 1_000,
    tax: 100,
    pension: 50,
    net: 850,
  }));
  const started = performance.now();
  const markup = render(fixture, fixture[0]);

  // One page of rows plus the total row and the selected row's phone detail.
  expect(markup.match(/<tr /g)?.length).toBeLessThanOrEqual(25 + 3);
  expect(markup.replaceAll('<!-- -->', '')).toContain('1-25 of 10000');
  expect(markup).toContain('10,000 payslips in EUR');
  expect(markup).toContain('EUR 10000000.00');
  expect(performance.now() - started).toBeLessThan(1_000);
});

import { describe, expect, test } from 'bun:test';
import { CSV_IMPORT_LIMITS, type CsvImportMapping } from '@quro/shared';
import { analyzeCsv, ImportInputError } from './analyze';
import {
  cleanText,
  deriveExternalIds,
  guessDecimalSeparator,
  suggestColumns,
  parseCsvAmount,
  parseDateWithFormat,
  parseImportMapping,
  resolveDateFormat,
} from './normalize';
import { CsvFormatError, detectDelimiter, parseCsv } from './parse';

const mapping = (overrides: Partial<CsvImportMapping> = {}): CsvImportMapping => ({
  source: 'Synthetic bank',
  delimiter: 'auto',
  columns: { date: 'Date', amount: 'Amount', description: 'Description' },
  dateFormat: 'auto',
  decimalSeparator: '.',
  defaultCurrency: 'EUR',
  invertSign: false,
  defaultCategory: 'Uncategorised',
  ...overrides,
});

describe('parseCsv', () => {
  test('reads quoted cells with delimiters, doubled quotes and line breaks', () => {
    const parsed = parseCsv('Date,Description\r\n2026-01-02,"Coffee, ""large""\nsecond line"\r\n');
    expect(parsed.headers).toEqual(['Date', 'Description']);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]!.cells[1]).toBe('Coffee, "large"\nsecond line');
    expect(parsed.records[0]!.line).toBe(2);
  });

  test('strips a byte order mark and accepts LF and CR line ends', () => {
    expect(parseCsv('﻿A,B\n1,2\r3,4').records.map((r) => r.cells)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  test('detects semicolon, tab and pipe delimiters outside quotes', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('"a,b,c"|d|e\n')).toBe('|');
  });

  test('refuses an unterminated quote, a NUL byte, duplicate and empty headers', () => {
    expect(() => parseCsv('A,B\n"open,1')).toThrow(CsvFormatError);
    expect(() => parseCsv(`A,B\n1,${String.fromCharCode(0)}`)).toThrow('not a text file');
    expect(() => parseCsv('A,A\n1,2')).toThrow('twice');
    expect(() => parseCsv('A,\n1,2')).toThrow('header name');
    expect(() => parseCsv('')).toThrow('empty');
  });

  test('enforces the row, column, cell and size limits', () => {
    const rows = Array.from({ length: CSV_IMPORT_LIMITS.maxRows + 1 }, (_, i) => `${i},x`);
    expect(() => parseCsv(`A,B\n${rows.join('\n')}`)).toThrow('more than 5000 rows');
    expect(
      parseCsv(`A,B\n${rows.slice(0, CSV_IMPORT_LIMITS.maxRows).join('\n')}`).records,
    ).toHaveLength(CSV_IMPORT_LIMITS.maxRows);
    const wide = Array.from({ length: CSV_IMPORT_LIMITS.maxColumns + 1 }, (_, i) => `c${i}`);
    expect(() => parseCsv(wide.join(','))).toThrow('more than 50 columns');
    expect(() => parseCsv(`A\n${'x'.repeat(CSV_IMPORT_LIMITS.maxCellLength + 1)}`)).toThrow(
      'longer',
    );
    expect(() => parseCsv('A\n' + 'x'.repeat(CSV_IMPORT_LIMITS.maxBytes))).toThrow('larger');
  });

  test('skips blank lines and keeps ragged records for the row check', () => {
    const parsed = parseCsv('A,B\n\n1\n2,3\n');
    expect(parsed.records.map((r) => r.cells)).toEqual([['1'], ['2', '3']]);
    expect(parsed.records.map((r) => r.rowNumber)).toEqual([1, 2]);
  });
});

describe('parseCsvAmount', () => {
  test.each([
    ['1,234.56', '.', 1234.56],
    ['1.234,56', ',', 1234.56],
    ['12,5', ',', 12.5],
    ['(12.50)', '.', -12.5],
    ['12.50-', '.', -12.5],
    ['-1 234,00', ',', -1234],
    ['€ 9.99', '.', 9.99],
    ['+7', '.', 7],
    ['12.500', '.', 12.5],
    ['.5', '.', 0.5],
  ] as const)('%s with %s is %d', (cell, separator, expected) => {
    expect(parseCsvAmount(cell, separator)).toBe(expected);
  });

  test.each([
    ['1.5', ','], // dots group by three, so "1.5" is not 15
    ['1,23', '.'],
    ['12.345', '.'],
    ['1e5', '.'],
    ['0x10', '.'],
    ['', '.'],
    ['abc', '.'],
    ['1.2.3', '.'],
    ['1,2,3', '.'],
    ['NaN', '.'],
    ['Infinity', '.'],
  ] as const)('%s with %s is refused', (cell, separator) => {
    expect(parseCsvAmount(cell, separator)).toBeNull();
  });
});

describe('dates', () => {
  test('parses each format and refuses impossible days', () => {
    expect(parseDateWithFormat('2026-3-4', 'YYYY-MM-DD')).toBe('2026-03-04');
    expect(parseDateWithFormat('04/03/2026', 'DD/MM/YYYY')).toBe('2026-03-04');
    expect(parseDateWithFormat('04/03/2026', 'MM/DD/YYYY')).toBe('2026-04-03');
    expect(parseDateWithFormat('04.03.2026', 'DD.MM.YYYY')).toBe('2026-03-04');
    expect(parseDateWithFormat('31/02/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseDateWithFormat('2026-13-01', 'YYYY-MM-DD')).toBeNull();
  });

  test('auto settles on the one format every cell fits and refuses an ambiguous file', () => {
    expect(resolveDateFormat('auto', ['25/04/2026', '03/04/2026'])).toEqual({
      ok: true,
      format: 'DD/MM/YYYY',
    });
    expect(resolveDateFormat('auto', ['04/25/2026', '03/04/2026'])).toEqual({
      ok: true,
      format: 'MM/DD/YYYY',
    });
    const ambiguous = resolveDateFormat('auto', ['03/04/2026', '05/06/2026']);
    expect(ambiguous.ok).toBe(false);
    expect(resolveDateFormat('auto', ['2026-01-02'])).toEqual({ ok: true, format: 'YYYY-MM-DD' });
    expect(resolveDateFormat('auto', ['25/04/2026', '2026-01-02']).ok).toBe(false);
    expect(resolveDateFormat('MM/DD/YYYY', ['03/04/2026'])).toEqual({
      ok: true,
      format: 'MM/DD/YYYY',
    });
  });
});

describe('cleanText', () => {
  test('keeps formula-like text as text and flags it', () => {
    expect(cleanText('=HYPERLINK("http://x","y")')).toEqual({
      text: '=HYPERLINK("http://x","y")',
      formulaLike: true,
    });
    expect(cleanText('@SUM(A1)').formulaLike).toBe(true);
    expect(cleanText('Coffee').formulaLike).toBe(false);
  });

  test('takes off the apostrophe an export adds, controls, spaces and excess length', () => {
    expect(cleanText("'=1+1")).toEqual({ text: '=1+1', formulaLike: true });
    expect(cleanText("'Quoted word").text).toBe("'Quoted word");
    expect(cleanText('a\u0007b\n  c').text).toBe('a b c');
    expect(cleanText('x'.repeat(900)).text).toHaveLength(500);
  });
});

describe('deriveExternalIds', () => {
  const row = (description: string, amount = -5) => ({
    rowNumber: 1,
    line: 2,
    date: '2026-01-02',
    amount,
    currency: 'EUR' as const,
    description,
    merchant: null,
    category: null,
    externalId: null,
    balance: null,
    formulaLike: false,
  });

  test('identical rows get distinct keys, and the same file gives the same keys', () => {
    const rows = [row('Coffee'), row('Coffee'), row('coffee', -6)];
    const first = deriveExternalIds(rows);
    expect(new Set(first).size).toBe(3);
    expect(deriveExternalIds(rows)).toEqual(first);
  });

  test('a bank id is used as it is', () => {
    expect(deriveExternalIds([{ ...row('x'), externalId: 'TX-1' }])).toEqual(['TX-1']);
  });
});

describe('parseImportMapping', () => {
  const valid = {
    source: ' ING ',
    columns: { date: 'Date', amount: 'Amount', description: 'Description' },
    defaultCurrency: 'EUR',
  };

  test('applies defaults and trims the source', () => {
    const parsed = parseImportMapping(valid, 'savings');
    expect(parsed).toMatchObject({
      ok: true,
      value: { source: 'ING', delimiter: 'auto', dateFormat: 'auto', decimalSeparator: '.' },
    });
  });

  test.each([
    [{ ...valid, source: '' }, 'savings'],
    [{ ...valid, userId: 2 }, 'savings'],
    [{ ...valid, defaultCurrency: 'XXX' }, 'savings'],
    [{ ...valid, decimalSeparator: ';' }, 'savings'],
    [{ ...valid, columns: { date: 'Date', description: 'D' } }, 'savings'],
    [{ ...valid, columns: { ...valid.columns, debit: 'Out' } }, 'savings'],
    [{ ...valid, columns: { ...valid.columns, balance: 'Bal' } }, 'budget'],
    [{ ...valid, columns: { ...valid.columns, category: 'Cat' } }, 'savings'],
    [{ ...valid, columns: { ...valid.columns, owner: 'x' } }, 'savings'],
    ['text', 'savings'],
  ] as const)('refuses %j for %s', (input, kind) => {
    expect(parseImportMapping(input, kind).ok).toBe(false);
  });
});

describe('analyzeCsv', () => {
  const csv = [
    'Date,Amount,Description,Currency,Balance',
    '2026-01-02,-12.50,Coffee,EUR,87.50',
    '2026-01-03,100.00,Salary,EUR,187.50',
    '2026-01-03,5.00,Gift,GBP,192.50',
    'not a date,1.00,Broken,EUR,',
    '2026-01-04,0.00,Zero,EUR,',
    '2026-01-05,abc,Letters,EUR,',
  ].join('\n');
  const columns = {
    date: 'Date',
    amount: 'Amount',
    description: 'Description',
    currency: 'Currency',
    balance: 'Balance',
  };

  test('mixed currencies are refused per row on a savings account, never converted', () => {
    const analysis = analyzeCsv({
      kind: 'savings',
      csv,
      mapping: mapping({ columns, dateFormat: 'YYYY-MM-DD' }),
      accountCurrency: 'EUR',
    });
    const byRow = Object.fromEntries(analysis.rows.map((r) => [r.rowNumber, r]));
    expect(byRow[1]!.status).toBe('ready');
    expect(byRow[3]!.status).toBe('error');
    expect(byRow[3]!.reason).toContain('GBP');
    expect(byRow[4]!.reason).toContain('date');
    expect(byRow[5]!.reason).toContain('zero');
    expect(byRow[6]!.reason).toContain('amount');
    // The closing balance is the last dated row's balance.
    expect(analysis.closing).toMatchObject({ amount: 192.5, date: '2026-01-03' });
  });

  test('an ambiguous closing balance is not guessed', () => {
    const analysis = analyzeCsv({
      kind: 'savings',
      csv: 'Date,Amount,Description,Balance\n2026-01-03,1,A,10\n2026-01-03,2,B,99',
      mapping: mapping({
        columns: { date: 'Date', amount: 'Amount', description: 'Description', balance: 'Balance' },
      }),
      accountCurrency: 'EUR',
    });
    expect(analysis.closing).toBeNull();
    expect(analysis.warnings.join(' ')).toContain('closing balance');
  });

  test('an ambiguous date column fails the file with a message that names the choice', () => {
    expect(() =>
      analyzeCsv({
        kind: 'savings',
        csv: 'Date,Amount,Description\n03/04/2026,1,A\n05/06/2026,2,B',
        mapping: mapping(),
        accountCurrency: 'EUR',
      }),
    ).toThrow(/choose the date format/);
  });

  test('a missing mapped column and an empty file fail the file', () => {
    expect(() =>
      analyzeCsv({
        kind: 'budget',
        csv: 'A,B\n1,2',
        mapping: mapping(),
        accountCurrency: undefined,
      }),
    ).toThrow('no column named "Date"');
    expect(() =>
      analyzeCsv({ kind: 'budget', csv: 'Date,Amount,Description\n', mapping: mapping() }),
    ).toThrow(ImportInputError);
  });

  test('budget imports skip money in and keep expenses', () => {
    const analysis = analyzeCsv({
      kind: 'budget',
      csv: 'Date,Amount,Description\n2026-01-02,-3.20,Bread\n2026-01-03,50,Refund',
      mapping: mapping({ dateFormat: 'YYYY-MM-DD' }),
    });
    expect(analysis.rows.map((r) => r.status)).toEqual(['ready', 'skipped']);
    expect(analysis.rows[0]!.row!.category).toBe('Uncategorised');
  });

  test('debit and credit columns, inverted signs and decimal commas', () => {
    const analysis = analyzeCsv({
      kind: 'savings',
      csv: 'Datum;Af;Bij;Omschrijving\n02-01-2026;1.234,50;;Rent\n03-01-2026;;20,00;Refund\n04-01-2026;1,00;2,00;Both',
      mapping: mapping({
        delimiter: 'auto',
        decimalSeparator: ',',
        dateFormat: 'DD-MM-YYYY',
        columns: { date: 'Datum', debit: 'Af', credit: 'Bij', description: 'Omschrijving' },
      }),
      accountCurrency: 'EUR',
    });
    expect(analysis.rows.map((r) => r.row?.amount ?? null)).toEqual([-1234.5, 20, null]);
    expect(analysis.rows[2]!.reason).toContain('both a debit and a credit');
  });

  test('formula-like cells are stored as text and warned about', () => {
    const analysis = analyzeCsv({
      kind: 'savings',
      csv: 'Date,Amount,Description\n2026-01-02,-1,"=HYPERLINK(""http://example.test"")"',
      mapping: mapping({ dateFormat: 'YYYY-MM-DD' }),
      accountCurrency: 'EUR',
    });
    expect(analysis.rows[0]!.row!.description).toBe('=HYPERLINK("http://example.test")');
    expect(analysis.rows[0]!.row!.formulaLike).toBe(true);
    expect(analysis.warnings).toHaveLength(1);
  });

  test('a repeated bank id is a duplicate within the file', () => {
    const analysis = analyzeCsv({
      kind: 'savings',
      csv: 'Date,Amount,Description,Id\n2026-01-02,-1,A,T1\n2026-01-02,-1,A,T1',
      mapping: mapping({
        dateFormat: 'YYYY-MM-DD',
        columns: { date: 'Date', amount: 'Amount', description: 'Description', externalId: 'Id' },
      }),
      accountCurrency: 'EUR',
    });
    expect(analysis.rows.map((r) => r.status)).toEqual(['ready', 'duplicate']);
  });
});

describe('column suggestions', () => {
  test('guesses columns from English and Dutch headers, matching short words only exactly', () => {
    expect(
      suggestColumns(['Datum', 'Omschrijving', 'Af', 'Bij', 'Saldo', 'Affiliate', 'Valuta']),
    ).toEqual({
      date: 'Datum',
      description: 'Omschrijving',
      debit: 'Af',
      credit: 'Bij',
      balance: 'Saldo',
      currency: 'Valuta',
    });
    expect(suggestColumns(['Booking Date', 'Amount', 'Transaction ID', 'Memo'])).toEqual({
      date: 'Booking Date',
      amount: 'Amount',
      externalId: 'Transaction ID',
      description: 'Memo',
    });
  });

  test('reads the decimal separator from amounts that show one', () => {
    expect(guessDecimalSeparator(['54,30', '2,40', ''])).toBe(',');
    expect(guessDecimalSeparator(['54.30', '1,500.00'])).toBe('.');
    expect(guessDecimalSeparator(['54', '12'])).toBeNull();
    expect(guessDecimalSeparator(['1,5', '2.50'])).toBeNull();
  });
});

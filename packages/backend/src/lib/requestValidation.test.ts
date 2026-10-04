import { describe, expect, test } from 'bun:test';
import {
  err,
  isRecord,
  ok,
  parseBooleanField,
  parseCurrencyField,
  parseDateField,
  parseDateString,
  parseId,
  parseInteger,
  parseIntegerField,
  parseNonEmptyString,
  parseNormalizedDecimal,
  parseNormalizedDecimalField,
  parseNumber,
  parseNumberField,
  parseOptionalBooleanField,
  parseOptionalDateField,
  parseOptionalId,
  parseOptionalIntegerField,
  parseOptionalNormalizedDecimalField,
  parseOptionalNumberField,
  parseOptionalTextField,
  parsePatchFields,
  parsePositiveNumberField,
  parseRequiredFields,
  parseString,
  parseTextField,
  parseWholeNumber,
  pickPatchedValue,
  readJsonBody,
  readJsonRecord,
  rejectUnknownFields,
} from './requestValidation';
import { toNumberOrZero } from './numbers';

describe('request validation primitives', () => {
  test('constructs success and error results', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err('bad')).toEqual({ ok: false, error: 'bad' });
  });

  test('recognizes plain records only', () => {
    expect(isRecord({ key: 'value' })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('value')).toBe(false);
  });

  test('reads JSON bodies and translates parser failures', async () => {
    expect(await readJsonBody({ json: () => Promise.resolve({ id: 1 }) }, 'invalid')).toEqual(
      ok({ id: 1 }),
    );
    expect(
      await readJsonBody({ json: () => Promise.reject(new Error('malformed')) }, 'invalid'),
    ).toEqual(err('invalid'));
  });
});

describe('identifier and numeric parsing', () => {
  test('parses positive 32-bit ids including leading zeros', () => {
    expect(parseId('1')).toBe(1);
    expect(parseId('01')).toBe(1);
    expect(parseId('2147483647')).toBe(2_147_483_647);
    expect(parseId('0')).toBeNull();
    expect(parseId('-1')).toBeNull();
    expect(parseId('2147483648')).toBeNull();
    expect(parseId('abc')).toBeNull();
  });

  test('parses integers without accepting partial or non-finite values', () => {
    expect(parseInteger(4)).toBe(4);
    expect(parseInteger(' -4 ')).toBe(-4);
    expect(parseInteger(4.2)).toBeNull();
    expect(parseInteger('4.2')).toBeNull();
    expect(parseInteger('4px')).toBeNull();
    expect(parseInteger(null)).toBeNull();
  });

  test('parses finite numbers from numbers and trimmed strings', () => {
    expect(parseNumber(4.2)).toBe(4.2);
    expect(parseNumber(' 4.2 ')).toBe(4.2);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('nope')).toBeNull();
    expect(parseNumber(Number.NaN)).toBeNull();
    expect(parseNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseNumber({})).toBeNull();
  });

  test('enforces number and integer field bounds', () => {
    expect(parseNumberField('5', 'bad', 5)).toEqual(ok(5));
    expect(parseNumberField(4, 'bad', 5)).toEqual(err('bad'));
    expect(parseOptionalNumberField('', 'bad', 0)).toEqual(ok(null));
    expect(parseOptionalNumberField(null, 'bad', 0)).toEqual(ok(null));
    expect(parseOptionalNumberField(-1, 'bad', 0)).toEqual(err('bad'));
    expect(parseIntegerField('5', 'bad', 1, 5)).toEqual(ok(5));
    expect(parseIntegerField(6, 'bad', 1, 5)).toEqual(err('bad'));
    expect(parseOptionalIntegerField(undefined, 'bad', 1, 5)).toEqual(ok(null));
    expect(parseOptionalIntegerField('', 'bad', 1, 5)).toEqual(ok(null));
    expect(parseOptionalIntegerField(0, 'bad', 1, 5)).toEqual(err('bad'));
  });
});

describe('text, date, currency, and boolean parsing', () => {
  test('trims strings and distinguishes optional empty text', () => {
    expect(parseString(' text ')).toBe('text');
    expect(parseString(3)).toBeNull();
    expect(parseNonEmptyString(' text ')).toBe('text');
    expect(parseNonEmptyString('   ')).toBeNull();
    expect(parseTextField(' name ', 'required')).toEqual(ok('name'));
    expect(parseTextField(' ', 'required')).toEqual(err('required'));
    expect(parseOptionalTextField(' ', 'invalid')).toEqual(ok(null));
    expect(parseOptionalTextField(null, 'invalid')).toEqual(ok(null));
    expect(parseOptionalTextField(3, 'invalid')).toEqual(err('invalid'));
  });

  test('accepts real ISO dates and rejects malformed or rolled dates', () => {
    expect(parseDateString('2024-02-29')).toBe('2024-02-29');
    expect(parseDateString('2024-02-30')).toBeNull();
    expect(parseDateString('2024-13-01')).toBeNull();
    expect(parseDateString('2024-2-01')).toBeNull();
    expect(parseDateField('2024-02-29', 'bad')).toEqual(ok('2024-02-29'));
    expect(parseDateField('2023-02-29', 'bad')).toEqual(err('bad'));
  });

  test('validates currency and boolean fields', () => {
    expect(parseCurrencyField('EUR')).toEqual(ok('EUR'));
    expect(parseCurrencyField('XYZ')).toEqual(err('Invalid currency'));
    expect(parseBooleanField(true, 'bad')).toEqual(ok(true));
    expect(parseBooleanField('true', 'bad')).toEqual(err('bad'));
    expect(parseOptionalBooleanField(false, 'bad')).toEqual(ok(false));
    expect(parseOptionalBooleanField(null, 'bad')).toEqual(ok(null));
    expect(parseOptionalBooleanField(undefined, 'bad')).toEqual(ok(null));
    expect(parseOptionalBooleanField('false', 'bad')).toEqual(err('bad'));
  });
});

describe('object field parsing', () => {
  const parsers = {
    name: (value: unknown) => parseTextField(value, 'name required'),
    count: (value: unknown) => parseIntegerField(value, 'count required', 0),
  };

  test('allows declared fields and rejects a client-supplied userId', () => {
    expect(rejectUnknownFields({ name: 'A' }, ['name'])).toEqual(ok(undefined));
    expect(rejectUnknownFields({ name: 'A', userId: 3 }, ['name'])).toEqual(
      err('Unknown field: userId'),
    );
    expect(rejectUnknownFields({ extra: true }, ['name'])).toEqual(err('Unknown field: extra'));
  });

  test('requires every field and returns the first parser failure', () => {
    expect(parseRequiredFields({ name: 'A', count: 2 }, parsers)).toEqual(
      ok({ name: 'A', count: 2 }),
    );
    expect(parseRequiredFields({ name: ' ', count: 'bad' }, parsers)).toEqual(err('name required'));
  });

  test('parses present patch fields and skips absent ones', () => {
    expect(parsePatchFields({ name: ' A ' }, parsers)).toEqual(ok({ name: 'A' }));
    expect(parsePatchFields({ count: 'bad' }, parsers)).toEqual(err('count required'));
    expect(parsePatchFields({}, parsers)).toEqual(ok({}));
  });
});

describe('shared helpers', () => {
  test('parses positive numbers and optional dates', () => {
    expect(parsePositiveNumberField('2.5', 'bad')).toEqual(ok(2.5));
    expect(parsePositiveNumberField(0, 'bad')).toEqual(err('bad'));
    expect(parseOptionalDateField('', 'bad')).toEqual(ok(null));
    expect(parseOptionalDateField('2024-02-29', 'bad')).toEqual(ok('2024-02-29'));
    expect(parseOptionalDateField('2023-02-29', 'bad')).toEqual(err('bad'));
  });

  test('parses optional ids', () => {
    expect(parseOptionalId(undefined)).toBeNull();
    expect(parseOptionalId('')).toBeNull();
    expect(parseOptionalId(7)).toBe(7);
    expect(parseOptionalId('1.5')).toBe('invalid');
  });

  test('normalizes comma and dot decimals', () => {
    expect(parseNormalizedDecimal('1.234,56')).toBe(1234.56);
    expect(parseNormalizedDecimal('1,234.56')).toBe(1234.56);
    expect(parseNormalizedDecimal('12,5')).toBe(12.5);
    expect(parseNormalizedDecimal('  ')).toBeNull();
    expect(parseNormalizedDecimalField('-1', 'bad', 0)).toEqual(err('bad'));
  });

  test('handles grouped decimals and rejects ambiguous or malformed input', () => {
    expect(parseNormalizedDecimal('1,250,000')).toBe(1_250_000);
    expect(parseNormalizedDecimal('1.234.567')).toBe(1_234_567);
    expect(parseNormalizedDecimal('0,125')).toBe(0.125);
    expect(parseNormalizedDecimal('.5')).toBe(0.5);
    expect(parseNormalizedDecimal('250,000')).toBeNull();
    expect(parseNormalizedDecimal('1,5.3')).toBeNull();
    expect(parseNormalizedDecimal('12abc')).toBeNull();
    expect(parseOptionalNormalizedDecimalField('', 'bad')).toEqual(ok(null));
    expect(parseOptionalNormalizedDecimalField('250,000', 'bad')).toEqual(err('bad'));
  });

  test('parses whole numbers from integral values', () => {
    expect(parseWholeNumber('40.0')).toBe(40);
    expect(parseWholeNumber('4e1')).toBe(40);
    expect(parseWholeNumber(3)).toBe(3);
    expect(parseWholeNumber('4.5')).toBeNull();
    expect(parseWholeNumber('')).toBeNull();
  });

  test('coerces numbers with null or zero fallbacks', () => {
    expect(parseNumber('3.5')).toBe(3.5);
    expect(parseNumber('abc')).toBeNull();
    expect(toNumberOrZero(null)).toBe(0);
    expect(toNumberOrZero('4')).toBe(4);
  });

  test('picks patched values over existing ones', () => {
    expect(pickPatchedValue(undefined, 1)).toBe(1);
    expect(pickPatchedValue(null, 1)).toBeNull();
  });

  test('reads JSON object bodies', async () => {
    expect(await readJsonRecord({ json: () => Promise.resolve({ a: 1 }) }, 'bad')).toEqual(
      ok({ a: 1 }),
    );
    expect(await readJsonRecord({ json: () => Promise.resolve([1]) }, 'bad')).toEqual(err('bad'));
    expect(
      await readJsonRecord(
        {
          json: () => Promise.reject(new Error('x')),
        },
        'bad',
      ),
    ).toEqual(err('bad'));
  });
});

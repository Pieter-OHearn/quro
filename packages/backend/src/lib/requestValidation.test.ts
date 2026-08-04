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
  parseNumber,
  parseNumberField,
  parseOptionalBooleanField,
  parseOptionalIntegerField,
  parseOptionalNumberField,
  parseOptionalTextField,
  parsePatchFields,
  parseRequiredFields,
  parseString,
  parseTextField,
  readJsonBody,
  rejectUnknownFields,
} from './requestValidation';

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

  test('allows declared fields and the implicit userId field', () => {
    expect(rejectUnknownFields({ name: 'A', userId: 3 }, ['name'])).toEqual(ok(undefined));
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

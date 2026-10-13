import { describe, expect, test } from 'bun:test';
import { inspect } from 'node:util';
import { generateTestSecretsKey } from '../test/config';
import {
  classifySecret,
  envelopeKeyId,
  openSecret,
  SecretsKey,
  SecretsKeyFormatError,
  SecretUnreadableError,
  type SecretPlace,
} from './secretEnvelope';

// Keys are random per run; values are synthetic markers.
const keyHex = generateTestSecretsKey();
const key = SecretsKey.parse(keyHex);
const otherKey = SecretsKey.parse(generateTestSecretsKey());
const PLACE: SecretPlace = { table: 'bunq_connections', column: 'access_token', ownerId: 7 };
const MARKER = 'synthetic-envelope-marker-0001';

function unreadableReason(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof SecretUnreadableError) return error.reason;
    throw error;
  }
  throw new Error('expected the value to be unreadable');
}

describe('secrets key', () => {
  test('accepts 64 hexadecimal characters and derives a stable 16-character key id', () => {
    expect(key.id).toMatch(/^[0-9a-f]{16}$/);
    expect(SecretsKey.parse(keyHex).id).toBe(key.id);
    expect(SecretsKey.parse(keyHex.toUpperCase()).id).toBe(key.id);
    expect(otherKey.id).not.toBe(key.id);
  });

  test.each([
    ['empty', ''],
    ['63 characters', keyHex.slice(1)],
    ['65 characters', `${keyHex}a`],
    ['not hexadecimal', `${keyHex.slice(1)}g`],
    ['with spaces', `${keyHex.slice(0, 32)} ${keyHex.slice(32)}`],
    ['a repeated byte', 'ab'.repeat(32)],
  ])('refuses %s without putting the content in the message', (_label, text) => {
    try {
      SecretsKey.parse(text);
      throw new Error('expected a format error');
    } catch (error) {
      expect(error).toBeInstanceOf(SecretsKeyFormatError);
      if (text) expect((error as Error).message).not.toContain(text);
    }
  });

  test('printing or serialising it shows the key id only', () => {
    const rendered = [String(key), JSON.stringify({ key }), inspect({ key }), `${key}`].join('\n');
    expect(rendered).toContain(key.id);
    expect(rendered).not.toContain(keyHex);
    expect(rendered).not.toContain(keyHex.toUpperCase());
  });
});

describe('envelope', () => {
  test('round-trips text, including an empty value and non-ASCII characters', () => {
    for (const value of [MARKER, '', '-----BEGIN PRIVATE KEY-----\nsynthetic\n', 'ünïcødé ✓']) {
      const sealed = key.seal(value, PLACE);
      expect(openSecret(sealed, PLACE, { current: key, previous: null })).toEqual({
        value,
        state: 'current',
      });
    }
  });

  test('has the documented layout and never contains the plaintext', () => {
    const sealed = key.seal(MARKER, PLACE);
    const parts = sealed.split(':');
    expect(parts).toHaveLength(7);
    expect(parts.slice(0, 4)).toEqual(['quro-secret', 'v1', 'aes-256-gcm', key.id]);
    expect(Buffer.from(parts[4]!, 'base64url')).toHaveLength(12);
    expect(Buffer.from(parts[6]!, 'base64url')).toHaveLength(16);
    expect(sealed).not.toContain(MARKER);
    expect(envelopeKeyId(sealed)).toBe(key.id);
  });

  test('uses a fresh nonce for every value', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => key.seal(MARKER, PLACE).split(':')[4]));
    expect(nonces.size).toBe(50);
  });

  test('a value moved to another column or another user fails its check', () => {
    const sealed = key.seal(MARKER, PLACE);
    const keyring = { current: key, previous: null };
    expect(
      unreadableReason(() => openSecret(sealed, { ...PLACE, column: 'session_token' }, keyring)),
    ).toBe('authentication');
    expect(unreadableReason(() => openSecret(sealed, { ...PLACE, ownerId: 8 }, keyring))).toBe(
      'authentication',
    );
    expect(unreadableReason(() => openSecret(sealed, { ...PLACE, table: 'other' }, keyring))).toBe(
      'authentication',
    );
  });

  test.each([4, 5, 6])('a changed character in part %i fails its check', (index) => {
    const parts = key.seal(MARKER, PLACE).split(':');
    const part = parts[index]!;
    // Change the first character, which carries whole bits in base64url.
    parts[index] = `${part[0] === 'A' ? 'B' : 'A'}${part.slice(1)}`;
    const reason = unreadableReason(() =>
      openSecret(parts.join(':'), PLACE, { current: key, previous: null }),
    );
    expect(['authentication', 'malformed']).toContain(reason);
  });

  test('a changed key id names a key that is not configured', () => {
    const sealed = key.seal(MARKER, PLACE).replace(key.id, otherKey.id);
    // With the other key configured the id matches but the tag does not.
    expect(classifySecret(sealed, { current: otherKey, previous: null })).toBe('current');
    expect(
      unreadableReason(() => openSecret(sealed, PLACE, { current: otherKey, previous: null })),
    ).toBe('authentication');
    expect(
      unreadableReason(() => openSecret(sealed, PLACE, { current: key, previous: null })),
    ).toBe('unknownKey');
  });

  test('without the key that sealed it a value is classified and refused, not guessed', () => {
    const sealed = key.seal(MARKER, PLACE);
    const keyring = { current: otherKey, previous: null };
    expect(classifySecret(sealed, keyring)).toBe('unknownKey');
    expect(classifySecret(sealed, { current: null, previous: null })).toBe('unknownKey');
    expect(unreadableReason(() => openSecret(sealed, PLACE, keyring))).toBe('unknownKey');
  });

  test('the previous key still opens what it sealed during a rotation', () => {
    const sealed = otherKey.seal(MARKER, PLACE);
    const keyring = { current: key, previous: otherKey };
    expect(classifySecret(sealed, keyring)).toBe('previous');
    expect(openSecret(sealed, PLACE, keyring)).toEqual({ value: MARKER, state: 'previous' });
  });

  test.each([
    'quro-secret:',
    'quro-secret:v2:aes-256-gcm:0123456789abcdef:AAAAAAAAAAAAAAAA:AA:AAAAAAAAAAAAAAAAAAAAAA',
    'quro-secret:v1:aes-128-gcm:0123456789abcdef:AAAAAAAAAAAAAAAA:AA:AAAAAAAAAAAAAAAAAAAAAA',
    'quro-secret:v1:aes-256-gcm:0123456789ABCDEF:AAAAAAAAAAAAAAAA:AA:AAAAAAAAAAAAAAAAAAAAAA',
    'quro-secret:v1:aes-256-gcm:0123456789abcdef:AAAA:AA:AAAAAAAAAAAAAAAAAAAAAA',
    'quro-secret:v1:aes-256-gcm:0123456789abcdef:AAAAAAAAAAAAAAAA:A=:AAAAAAAAAAAAAAAAAAAAAA',
    'quro-secret:v1:aes-256-gcm:0123456789abcdef:AAAAAAAAAAAAAAAA:AA:AAAAAAAAAAAAAAAAAAAAAA:extra',
  ])('a damaged envelope is malformed: %s', (value) => {
    expect(classifySecret(value, { current: key, previous: null })).toBe('malformed');
    expect(unreadableReason(() => openSecret(value, PLACE, { current: key, previous: null }))).toBe(
      'malformed',
    );
  });

  test('a value without the marker is unencrypted and returned as it is', () => {
    const keyring = { current: key, previous: null };
    expect(classifySecret(MARKER, keyring)).toBe('unencrypted');
    expect(openSecret(MARKER, PLACE, keyring)).toEqual({ value: MARKER, state: 'unencrypted' });
    expect(envelopeKeyId(MARKER)).toBeNull();
  });

  test('an unreadable value is reported without its content', () => {
    const sealed = key.seal(MARKER, PLACE);
    try {
      openSecret(sealed, { ...PLACE, ownerId: 9 }, { current: key, previous: null });
    } catch (error) {
      expect((error as Error).message).toContain('bunq_connections.access_token');
      expect((error as Error).message).not.toContain(sealed);
      expect((error as Error).message).not.toContain(MARKER);
    }
  });
});

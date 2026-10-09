import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { REGISTRATION_MODES } from '@quro/shared';
import { generateAuthCode, hashAuthCode, normalizeAuthCode } from './authCodes';
import { registrationRequirement } from './registration';
import { generateSessionToken, hashSessionToken } from './sessions';

const SESSION_DIGEST = /^[0-9a-f]{64}$/;

describe('registrationRequirement', () => {
  test.each([...REGISTRATION_MODES])('the first account needs a code in %s mode', (mode) => {
    expect(registrationRequirement(mode, false)).toBe('code');
  });

  test('after setup each mode applies its own rule', () => {
    expect(registrationRequirement('closed', true)).toBe('closed');
    expect(registrationRequirement('invite', true)).toBe('code');
    expect(registrationRequirement('open', true)).toBe('open');
  });
});

describe('session tokens', () => {
  test('raw tokens are 256-bit base64url and never look like a stored digest', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateSessionToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(token).not.toMatch(SESSION_DIGEST);
    }
  });

  test('stores the SHA-256 hex digest, matching what the migration computes for legacy tokens', () => {
    const legacyHexToken = 'ab'.repeat(32);
    const digest = hashSessionToken(legacyHexToken);
    expect(digest).toMatch(SESSION_DIGEST);
    expect(digest).toBe(createHash('sha256').update(legacyHexToken, 'utf8').digest('hex'));
    expect(digest).not.toBe(legacyHexToken);
  });
});

describe('operator codes', () => {
  test('are four groups of six Crockford base32 characters, 120 bits', () => {
    const codes = new Set(Array.from({ length: 50 }, generateAuthCode));
    expect(codes.size).toBe(50);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}(-[0-9A-HJKMNP-TV-Z]{6}){3}$/);
    }
  });

  test('tolerate case, spacing and look-alike characters when redeemed', () => {
    expect(normalizeAuthCode(' abcde-fghjk mnpqr-stvwx ')).toBe('ABCDEFGHJKMNPQRSTVWX');
    expect(normalizeAuthCode('o0-Il1')).toBe('00111');
    expect(hashAuthCode('ABCDE-FGHJK-MNPQR-STVW0')).toBe(hashAuthCode('abcde fghjk mnpqr stvwo'));
    expect(hashAuthCode('ABCDE-FGHJK-MNPQR-STVWX')).not.toBe(
      hashAuthCode('ABCDE-FGHJK-MNPQR-STVWY'),
    );
  });
});

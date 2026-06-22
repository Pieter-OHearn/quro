import { describe, expect, test } from 'bun:test';
import { buildOAuthState, parseSignedState } from './bunq';

function replaceSignature(state: string, signature: string): string {
  const dotIdx = state.lastIndexOf('.');
  return `${state.slice(0, dotIdx + 1)}${signature}`;
}

describe('bunq OAuth signed state', () => {
  test('round-trips a signed state to its user id', () => {
    const state = buildOAuthState(123, 'nonce-value');

    expect(parseSignedState(state)).toBe(123);
  });

  test('rejects a tampered signature', () => {
    const state = buildOAuthState(123, 'nonce-value');
    const tampered = `${state.slice(0, -1)}${state.endsWith('0') ? '1' : '0'}`;

    expect(parseSignedState(tampered)).toBeNull();
  });

  test('rejects a tampered payload with the original signature', () => {
    const state = buildOAuthState(123, 'nonce-value');
    const [, signature] = state.split('.');

    expect(parseSignedState(`456:nonce-value.${signature}`)).toBeNull();
  });

  test('rejects malformed and non-integer payloads', () => {
    expect(parseSignedState('state-without-signature')).toBeNull();
    expect(parseSignedState(buildOAuthState(Number.NaN, 'nonce-value'))).toBeNull();
  });

  test('rejects signature buffers with mismatched lengths without throwing', () => {
    const state = buildOAuthState(123, 'nonce-value');

    expect(parseSignedState(replaceSignature(state, 'abcd'))).toBeNull();
  });
});

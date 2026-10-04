import { describe, expect, test } from 'bun:test';
import { parseTrustedProxies, resolveClientAddress } from './clientAddress';

const proxies = parseTrustedProxies('172.18.0.0/16, 10.0.0.5');

function resolve(input: {
  peer?: string | null;
  realIp?: string;
  forwardedFor?: string;
  trusted?: ReturnType<typeof parseTrustedProxies>;
}) {
  return resolveClientAddress({
    peerAddress: input.peer,
    realIp: input.realIp,
    forwardedFor: input.forwardedFor,
    proxies: input.trusted ?? proxies,
  });
}

describe('parseTrustedProxies', () => {
  test('returns no proxies when unset', () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies('  ')).toEqual([]);
  });

  test('rejects malformed entries instead of silently trusting nothing', () => {
    expect(() => parseTrustedProxies('not-an-ip')).toThrow('Invalid TRUSTED_PROXIES');
    expect(() => parseTrustedProxies('10.0.0.0/33')).toThrow('Invalid TRUSTED_PROXIES');
  });
});

describe('resolveClientAddress', () => {
  test('ignores forwarded headers from an untrusted peer', () => {
    expect(resolve({ peer: '203.0.113.9', realIp: '1.2.3.4', forwardedFor: '5.6.7.8' })).toBe(
      '203.0.113.9',
    );
  });

  test('ignores forwarded headers when no proxy is configured', () => {
    expect(resolve({ peer: '172.18.0.2', realIp: '1.2.3.4', trusted: [] })).toBe('172.18.0.2');
  });

  test('uses X-Real-IP from a trusted CIDR peer', () => {
    expect(resolve({ peer: '172.18.0.2', realIp: '198.51.100.7' })).toBe('198.51.100.7');
  });

  test('uses an exact trusted peer and unwraps IPv4-mapped addresses', () => {
    expect(resolve({ peer: '::ffff:10.0.0.5', realIp: '198.51.100.7' })).toBe('198.51.100.7');
  });

  test('takes the right-most untrusted X-Forwarded-For hop, not a spoofed left entry', () => {
    expect(resolve({ peer: '172.18.0.2', forwardedFor: '9.9.9.9, 198.51.100.7, 172.18.0.3' })).toBe(
      '198.51.100.7',
    );
  });

  test('falls back to the proxy address when headers are missing or invalid', () => {
    expect(resolve({ peer: '172.18.0.2' })).toBe('172.18.0.2');
    expect(resolve({ peer: '172.18.0.2', realIp: 'garbage', forwardedFor: 'x, y' })).toBe(
      '172.18.0.2',
    );
  });

  test('returns null when the peer address is unknown', () => {
    expect(resolve({ peer: undefined, realIp: '1.2.3.4' })).toBeNull();
    expect(resolve({ peer: null })).toBeNull();
  });
});

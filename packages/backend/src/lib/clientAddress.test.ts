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
    proxies: input.trusted === undefined ? proxies : input.trusted,
  });
}

describe('parseTrustedProxies', () => {
  test('returns no proxies when unset', () => {
    expect(parseTrustedProxies(undefined)).toBeNull();
    expect(parseTrustedProxies('  ')).toBeNull();
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
    expect(resolve({ peer: '172.18.0.2', realIp: '1.2.3.4', trusted: null })).toBe('172.18.0.2');
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

  test('prefers X-Forwarded-For over an X-Real-IP the client could have supplied', () => {
    expect(
      resolve({ peer: '172.18.0.2', realIp: '1.2.3.4', forwardedFor: '1.2.3.4, 198.51.100.7' }),
    ).toBe('198.51.100.7');
  });

  test('looks past an X-Real-IP that is itself a trusted proxy', () => {
    // An outer proxy in front of the bundled nginx: nginx's X-Real-IP is the outer proxy.
    expect(
      resolve({ peer: '172.18.0.2', realIp: '10.0.0.5', forwardedFor: '198.51.100.7, 10.0.0.5' }),
    ).toBe('198.51.100.7');
    expect(resolve({ peer: '172.18.0.2', realIp: '10.0.0.5' })).toBe('172.18.0.2');
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

// Deployment modes from docs/security.md. The bundled nginx always appends its peer to
// X-Forwarded-For and overwrites X-Real-IP, so the backend sees "<client-supplied>, <nginx peer>".
describe('Compose proxy-trust defaults', () => {
  const nginx = '172.18.0.3';
  const lanClient = '192.168.1.50';

  test('the former default treated LAN clients as proxies', () => {
    const formerDefault = parseTrustedProxies('10.0.0.0/8,172.16.0.0/12,192.168.0.0/16');
    for (const spoofed of ['1.2.3.4', '5.6.7.8']) {
      expect(
        resolve({
          peer: nginx,
          realIp: lanClient,
          forwardedFor: `${spoofed}, ${lanClient}`,
          trusted: formerDefault,
        }),
      ).toBe(spoofed);
    }
  });

  const composeDefault = parseTrustedProxies('172.16.0.0/12');

  test('HTTP behind the bundled nginx keys each LAN client by its own address', () => {
    for (const client of [lanClient, '10.0.0.20']) {
      expect(
        resolve({
          peer: nginx,
          realIp: client,
          forwardedFor: `1.2.3.4, ${client}`,
          trusted: composeDefault,
        }),
      ).toBe(client);
    }
  });

  test('a host TLS proxy reaching nginx through the Docker gateway still resolves the client', () => {
    expect(
      resolve({
        peer: nginx,
        realIp: '172.18.0.1',
        forwardedFor: `9.9.9.9, ${lanClient}, 172.18.0.1`,
        trusted: composeDefault,
      }),
    ).toBe(lanClient);
  });

  test('a TLS proxy on another host must be added to TRUSTED_PROXIES', () => {
    const remoteProxy = '192.168.1.10';
    const request = {
      peer: nginx,
      realIp: remoteProxy,
      forwardedFor: `${lanClient}, ${remoteProxy}`,
    };
    expect(resolve({ ...request, trusted: composeDefault })).toBe(remoteProxy);
    expect(
      resolve({ ...request, trusted: parseTrustedProxies(`172.16.0.0/12,${remoteProxy}`) }),
    ).toBe(lanClient);
  });

  test('direct access to the backend from outside the trusted range ignores forwarded headers', () => {
    expect(
      resolve({
        peer: lanClient,
        realIp: '1.2.3.4',
        forwardedFor: '1.2.3.4',
        trusted: composeDefault,
      }),
    ).toBe(lanClient);
  });
});

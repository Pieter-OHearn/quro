import { isIP } from 'node:net';

const IPV4_MAPPED_PREFIX = '::ffff:';
const IPV4_BITS = 32;
const IPV4_OCTETS = 4;
const OCTET_RADIX = 256;

type TrustedProxy =
  { kind: 'exact'; address: string } | { kind: 'cidr'; base: number; mask: number };

export function normalizeAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  const unmapped = trimmed.startsWith(IPV4_MAPPED_PREFIX)
    ? trimmed.slice(IPV4_MAPPED_PREFIX.length)
    : trimmed;
  return isIP(unmapped) === 0 ? null : unmapped;
}

function ipv4ToInt(address: string): number | null {
  if (isIP(address) !== IPV4_OCTETS) return null;
  return address.split('.').reduce((acc, octet) => acc * OCTET_RADIX + Number(octet), 0);
}

function parseTrustedProxy(entry: string): TrustedProxy | null {
  const [rawAddress, rawBits, ...rest] = entry.trim().split('/');
  const address = normalizeAddress(rawAddress);
  if (!address || rest.length > 0) return null;
  if (rawBits === undefined) return { kind: 'exact', address };

  const base = ipv4ToInt(address);
  const bits = Number(rawBits);
  if (base === null || !/^\d+$/.test(rawBits) || bits > IPV4_BITS) return null;
  const hostBits = IPV4_BITS - bits;
  const mask = hostBits === IPV4_BITS ? 0 : (2 ** IPV4_BITS - 2 ** hostBits) >>> 0;
  return { kind: 'cidr', base: (base & mask) >>> 0, mask };
}

/** Parses `TRUSTED_PROXIES` (comma-separated IPs or IPv4 CIDRs). Invalid entries are rejected. */
export function parseTrustedProxies(raw: string | undefined): TrustedProxy[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .filter((entry) => entry.trim())
    .map((entry) => {
      const parsed = parseTrustedProxy(entry);
      if (!parsed) throw new Error(`Invalid TRUSTED_PROXIES entry: ${entry.trim()}`);
      return parsed;
    });
}

export function isTrustedProxy(address: string, proxies: ReadonlyArray<TrustedProxy>): boolean {
  const ipv4 = ipv4ToInt(address);
  return proxies.some((proxy) => {
    if (proxy.kind === 'exact') return proxy.address === address;
    return ipv4 !== null && (ipv4 & proxy.mask) >>> 0 === proxy.base;
  });
}

function forwardedClient(
  realIp: string | undefined,
  forwardedFor: string | undefined,
  proxies: ReadonlyArray<TrustedProxy>,
): string | null {
  const real = normalizeAddress(realIp);
  if (real) return real;

  const hops = (forwardedFor ?? '').split(',').map(normalizeAddress);
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const hop = hops[i];
    if (!hop) return null;
    if (!isTrustedProxy(hop, proxies)) return hop;
  }
  return null;
}

/**
 * Resolves the rate-limit key for a request. Forwarded headers are honoured only when the direct
 * peer is a configured trusted proxy; otherwise the peer address itself is used. Returns null when
 * the peer address is unknown so callers can fail closed instead of sharing one bucket.
 */
export function resolveClientAddress(input: {
  peerAddress: string | null | undefined;
  realIp: string | undefined;
  forwardedFor: string | undefined;
  proxies: ReadonlyArray<TrustedProxy>;
}): string | null {
  const peer = normalizeAddress(input.peerAddress);
  if (!peer) return null;
  if (!isTrustedProxy(peer, input.proxies)) return peer;
  return forwardedClient(input.realIp, input.forwardedFor, input.proxies) ?? peer;
}

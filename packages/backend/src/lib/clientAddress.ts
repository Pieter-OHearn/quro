import { BlockList, isIP } from 'node:net';

const IPV4_MAPPED_PREFIX = '::ffff:';

export type TrustedProxies = BlockList | null;

function normalizeAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return null;
  const unmapped = trimmed.startsWith(IPV4_MAPPED_PREFIX)
    ? trimmed.slice(IPV4_MAPPED_PREFIX.length)
    : trimmed;
  return isIP(unmapped) === 0 ? null : unmapped;
}

function parseSubnetBits(rawBits: string | undefined): number | null | 'invalid' {
  if (rawBits === undefined) return null;
  const bits = Number(rawBits);
  return /^\d+$/.test(rawBits) && bits <= 32 ? bits : 'invalid';
}

function addTrustedProxy(list: BlockList, entry: string): void {
  const [rawAddress, rawBits, ...rest] = entry.trim().split('/');
  const address = normalizeAddress(rawAddress);
  const bits = parseSubnetBits(rawBits);
  const family = address && isIP(address) === 4 ? 'ipv4' : 'ipv6';
  if (!address || rest.length > 0 || bits === 'invalid' || (bits !== null && family === 'ipv6')) {
    throw new Error(`Invalid TRUSTED_PROXIES entry: ${entry.trim()}`);
  }
  if (bits === null) list.addAddress(address, family);
  else list.addSubnet(address, bits, family);
}

/**
 * Parses `TRUSTED_PROXIES` (comma-separated IPs or IPv4 CIDRs). Returns null when none are
 * configured; invalid entries throw so a typo cannot silently disable proxy trust.
 */
export function parseTrustedProxies(raw: string | undefined): TrustedProxies {
  const entries = (raw ?? '').split(',').filter((entry) => entry.trim());
  if (entries.length === 0) return null;
  const list = new BlockList();
  for (const entry of entries) addTrustedProxy(list, entry);
  return list;
}

function isTrustedProxy(address: string, proxies: TrustedProxies): boolean {
  return proxies?.check(address, isIP(address) === 4 ? 'ipv4' : 'ipv6') ?? false;
}

function forwardedClient(
  realIp: string | undefined,
  forwardedFor: string | undefined,
  proxies: TrustedProxies,
): string | null {
  const real = normalizeAddress(realIp);
  if (real) return real;

  const hops = (forwardedFor ?? '').split(',');
  for (let i = hops.length - 1; i >= 0; i -= 1) {
    const hop = normalizeAddress(hops[i]);
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
  proxies: TrustedProxies;
}): string | null {
  const peer = normalizeAddress(input.peerAddress);
  if (!peer) return null;
  if (!isTrustedProxy(peer, input.proxies)) return peer;
  return forwardedClient(input.realIp, input.forwardedFor, input.proxies) ?? peer;
}

import { describe, expect, test } from 'bun:test';
import { createCookieTransportWarner, detectCookieTransportMismatch } from './cookieTransport';

describe('detectCookieTransportMismatch', () => {
  test('mode A: plain HTTP on the private network with SECURE_COOKIES=false is consistent', () => {
    expect(detectCookieTransportMismatch(false, 'http://quro.local')).toBeNull();
    expect(detectCookieTransportMismatch(false, 'http://192.168.1.20:3000')).toBeNull();
  });

  test('mode B: HTTPS at the reverse proxy with SECURE_COOKIES=true is consistent', () => {
    expect(detectCookieTransportMismatch(true, 'https://quro.example.com')).toBeNull();
  });

  test('HTTPS with SECURE_COOKIES=false is reported', () => {
    expect(detectCookieTransportMismatch(false, 'https://quro.example.com')).toBe(
      'insecure_over_https',
    );
  });

  test('plain HTTP with SECURE_COOKIES=true is reported, except on loopback', () => {
    expect(detectCookieTransportMismatch(true, 'http://quro.local')).toBe('secure_over_http');
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      expect(detectCookieTransportMismatch(true, origin)).toBeNull();
    }
  });

  test('missing or unusable origins are ignored', () => {
    for (const origin of [undefined, null, '', 'null', 'not a url']) {
      expect(detectCookieTransportMismatch(false, origin)).toBeNull();
      expect(detectCookieTransportMismatch(true, origin)).toBeNull();
    }
  });
});

describe('createCookieTransportWarner', () => {
  test('logs each kind of mismatch once, naming the setting and where it was seen', () => {
    const lines: string[] = [];
    const warn = createCookieTransportWarner((line) => lines.push(line));

    warn(false, 'https://quro.example.com', 'FRONTEND_ORIGIN');
    warn(false, 'https://quro.example.com', 'the Origin of a sign-in request');
    warn(true, 'http://quro.local', 'the Origin of a sign-in request');
    warn(true, 'http://quro.local', 'the Origin of a sign-in request');
    warn(false, 'http://quro.local', 'the Origin of a sign-in request');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('SECURE_COOKIES is false');
    expect(lines[0]).toContain('Detected from FRONTEND_ORIGIN.');
    expect(lines[1]).toContain('SECURE_COOKIES is true');
    // Only the scheme matters; the host name stays out of the log.
    expect(lines.join('\n')).not.toContain('quro.example.com');
    expect(lines.join('\n')).not.toContain('quro.local');
  });
});

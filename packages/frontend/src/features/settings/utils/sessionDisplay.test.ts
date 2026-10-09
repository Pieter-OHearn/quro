import { describe, expect, it } from 'bun:test';
import { describeUserAgent, formatSessionTime } from './sessionDisplay';

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Safari on macOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
      'Edge on Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Linux'],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1',
      'Chrome on iOS',
    ],
    ['curl/8.7.1', 'Unknown browser'],
    [null, 'Unknown browser'],
  ])('%s -> %s', (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected);
  });
});

describe('formatSessionTime', () => {
  it('formats valid timestamps and tolerates invalid ones', () => {
    expect(formatSessionTime('2026-10-09T08:30:00.000Z')).toContain('2026');
    expect(formatSessionTime('not a date')).toBe('unknown');
  });
});

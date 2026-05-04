import { describe, expect, test } from 'bun:test';
import { BUNQ_SYNC_LOOKBACK_MS, toBunqNewerThanCursor } from './bunqSyncCursor';

describe('Bunq sync cursor', () => {
  test('uses no cursor for first syncs', () => {
    expect(toBunqNewerThanCursor(null)).toBeUndefined();
  });

  test('rewinds the cursor to tolerate delayed Bunq payment visibility', () => {
    const lastSyncAt = new Date('2026-05-04T13:02:09.283Z');

    expect(toBunqNewerThanCursor(lastSyncAt)).toBe('2026-05-02T13:02:09.283Z');
  });

  test('allows the lookback window to be overridden', () => {
    const lastSyncAt = new Date('2026-05-04T13:02:09.283Z');

    expect(toBunqNewerThanCursor(lastSyncAt, BUNQ_SYNC_LOOKBACK_MS / 2)).toBe(
      '2026-05-03T13:02:09.283Z',
    );
  });
});

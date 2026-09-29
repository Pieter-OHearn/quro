import { DAY_MS } from '../constants/time';

export const BUNQ_SYNC_LOOKBACK_MS = 2 * DAY_MS;

export function toBunqNewerThanCursor(
  lastSyncAt: Date | null,
  lookbackMs = BUNQ_SYNC_LOOKBACK_MS,
): string | undefined {
  if (!lastSyncAt) return undefined;
  return new Date(lastSyncAt.getTime() - lookbackMs).toISOString();
}

import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from '../constants/time';

export const BUNQ_SYNC_LOOKBACK_MS =
  2 * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

export function toBunqNewerThanCursor(
  lastSyncAt: Date | null,
  lookbackMs = BUNQ_SYNC_LOOKBACK_MS,
): string | undefined {
  if (!lastSyncAt) return undefined;
  return new Date(lastSyncAt.getTime() - lookbackMs).toISOString();
}

import { db } from '../db/client';
import { sessions } from '../db/schema';
import { lt } from 'drizzle-orm';
import { DAY_MS } from '../constants/time';

const DEFAULT_INTERVAL_MS = DAY_MS;

export function startSessionCleanup(): void {
  const intervalMs = parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS ?? '') || DEFAULT_INTERVAL_MS;

  setInterval(() => {
    void db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .catch((err: unknown) => {
        console.error('[sessionCleanup] Failed to delete expired sessions:', err);
      });
  }, intervalMs);
}

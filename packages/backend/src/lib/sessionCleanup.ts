import { db } from '../db/client';
import { sessions } from '../db/schema';
import { lt } from 'drizzle-orm';
import { DAY_MS } from '../constants/time';
import { startIntervalJob } from './intervalJob';
import { purgeStaleAuthCodes } from './authCodes';

const DEFAULT_INTERVAL_MS = DAY_MS;

export function startSessionCleanup(): void {
  const intervalMs = parseInt(process.env.SESSION_CLEANUP_INTERVAL_MS ?? '') || DEFAULT_INTERVAL_MS;
  startIntervalJob({
    name: 'session-cleanup',
    intervalMs,
    runOnStart: false,
    coordinated: true,
    run: async () => {
      await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
      await purgeStaleAuthCodes();
    },
  });
}

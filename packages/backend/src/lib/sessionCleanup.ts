import { getConfig } from '../config';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import { lt } from 'drizzle-orm';
import { startIntervalJob } from './intervalJob';
import { purgeStaleAuthCodes } from './authCodes';

export function startSessionCleanup(): void {
  const intervalMs = getConfig().runtime.sessionCleanupIntervalMs;
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

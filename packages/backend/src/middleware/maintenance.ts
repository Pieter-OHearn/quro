import { createMiddleware } from 'hono/factory';
import { HTTP_STATUS } from '../constants/http';
import { maintenanceRequested, runUnlessMaintenance } from '../lib/maintenanceMode';
import { PUBLIC_PATHS } from '../lib/publicPaths';

// While `quro backup` or `quro restore` runs, the API refuses changes with 503 and keeps answering
// reads. A write that is already running holds the maintenance lock until it has finished, so the
// backup starts only after it (see lib/maintenanceMode.ts). Unauthenticated writes (sign-in,
// sign-up, password reset) touch no document, so they are refused during maintenance but never
// hold the lock: a client that sends its body slowly cannot hold a backup off.

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RETRY_AFTER_SECONDS = 60;

export const MAINTENANCE_MESSAGE =
  'Quro is being backed up or restored, so changes are paused. Try again in a minute.';

export const pauseWritesDuringMaintenance = createMiddleware(async (c, next) => {
  if (READ_METHODS.has(c.req.method)) {
    await next();
    return;
  }
  if (PUBLIC_PATHS.has(c.req.path)) {
    if (!(await maintenanceRequested())) {
      await next();
      return;
    }
  } else if ((await runUnlessMaintenance(() => next())).ran) {
    return;
  }
  c.header('Retry-After', String(RETRY_AFTER_SECONDS));
  return c.json(
    { error: MAINTENANCE_MESSAGE, code: 'maintenance' },
    HTTP_STATUS.SERVICE_UNAVAILABLE,
  );
});

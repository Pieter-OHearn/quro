import './config/bootServer';
import { getConfig } from './config';
import { createApp } from './app';
import { queryClient } from './db/client';
import { installGracefulShutdown } from './lib/gracefulShutdown';
import { stopIntervalJobs } from './lib/intervalJob';
import { closeMaintenanceGate } from './lib/maintenanceMode';
import { checkConfiguredCookieTransport } from './middleware/cookieTransport';
import { startSchedulers } from './schedulers';

const config = getConfig();
const DATABASE_CLOSE_TIMEOUT_SECONDS = 5;

// Warn when SECURE_COOKIES disagrees with the configured public origin.
checkConfiguredCookieTransport();

export const app = createApp(config);

// Started explicitly rather than through a default export, so a SIGTERM can stop it gracefully.
const server = Bun.serve({
  port: config.runtime.port,
  hostname: config.runtime.host,
  fetch: app.fetch,
});

startSchedulers(config);

installGracefulShutdown({
  stopServer: () => server.stop(),
  pendingRequests: () => server.pendingRequests,
  stopJobs: stopIntervalJobs,
  closeDatabase: async () => {
    await closeMaintenanceGate();
    await queryClient.end({ timeout: DATABASE_CLOSE_TIMEOUT_SECONDS });
  },
  log: (line) => console.log(line),
  exit: (code) => process.exit(code),
});

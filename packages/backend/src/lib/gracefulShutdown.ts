// Graceful shutdown for the API server. On SIGTERM (what `docker stop` and Compose send) or SIGINT
// the server stops accepting connections, lets the requests it is answering finish, waits for
// running background job cycles, closes its database connections and exits with 0. How long that
// may take is the orchestrator's stop timeout (Compose `stop_grace_period`, `docker stop -t`); a
// second signal exits at once.

export type ShutdownParts = {
  /** Stops listening and resolves when every request in flight has been answered. */
  stopServer: () => Promise<void>;
  /** The number of requests in flight, for the log line. */
  pendingRequests: () => number;
  /** Starts no further job cycles and resolves when the running ones have finished. */
  stopJobs: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  log: (line: string) => void;
  exit: (code: number) => void;
};

export async function shutDown(parts: ShutdownParts, signal: string): Promise<void> {
  parts.log(
    `[server] ${signal} received: refusing new connections, finishing ${parts.pendingRequests()} open request(s) and running jobs`,
  );
  await Promise.all([parts.stopServer(), parts.stopJobs()]);
  await parts.closeDatabase();
  parts.log('[server] Stopped');
}

/** Registers the signal handlers. Returns a function that removes them. */
export function installGracefulShutdown(parts: ShutdownParts): () => void {
  let stopping = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (stopping) {
      parts.log(`[server] ${signal} received again: exiting without waiting`);
      parts.exit(1);
      return;
    }
    stopping = true;
    shutDown(parts, signal).then(
      () => parts.exit(0),
      (error: unknown) => {
        parts.log(
          `[server] Shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        parts.exit(1);
      },
    );
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  return () => {
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);
  };
}

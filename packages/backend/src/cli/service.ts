import { resolve } from 'node:path';
import { getConfig } from '../config';
import { getBuildInfo } from '../lib/buildInfo';
import { EXIT_FAILURE, EXIT_OK, UsageError, type CommandIo } from './io';

// The long-running processes and the small commands around them: `serve`, `worker`, `health`
// and `version`. In the image, the `quro` wrapper starts `serve` and `worker` directly so the
// server is the container's main process; from a checkout they run as a child process here.

const BACKEND_ROOT = resolve(import.meta.dir, '../..');
const ENTRY_POINTS = {
  serve: 'src/index.ts',
  'worker pension-imports': 'src/workers/pensionImportWorker.ts',
} as const;

export const SERVICE_USAGE = {
  serve: 'Usage: quro serve\n\nRuns the API server. It never migrates; run `quro migrate` first.',
  worker:
    'Usage: quro worker pension-imports\n\nRuns the optional pension statement import worker.',
  health: `Usage: quro health

Exits 0 when the server in this container reports ready (GET /api/readiness), 1 otherwise.
For container health checks; it reads only PORT and HOST.`,
  version: `Usage: quro version [--json]

Prints the application version, the newest bundled migration and the image revision.`,
} as const;

function assertNoArguments(args: readonly string[], allowed: readonly string[] = []) {
  const unknown = args.find((arg) => !allowed.includes(arg));
  if (unknown) throw new UsageError(`Unknown argument: ${unknown}`);
}

function runChild(entry: string): Promise<number> {
  const child = Bun.spawn([process.execPath, entry], {
    cwd: BACKEND_ROOT,
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  process.on('SIGTERM', forward('SIGTERM'));
  process.on('SIGINT', forward('SIGINT'));
  return child.exited;
}

export function runServeCommand(args: readonly string[]): Promise<number> {
  assertNoArguments(args);
  return runChild(ENTRY_POINTS.serve);
}

export function runWorkerCommand(args: readonly string[]): Promise<number> {
  if (args.length !== 1 || args[0] !== 'pension-imports') {
    throw new UsageError('Usage: quro worker pension-imports');
  }
  return runChild(ENTRY_POINTS['worker pension-imports']);
}

const HEALTH_TIMEOUT_MS = 5000;
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '']);

export async function runHealthCommand(
  args: readonly string[],
  io: CommandIo,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  assertNoArguments(args);
  const { host, port } = getConfig().runtime;
  const target = WILDCARD_HOSTS.has(host) ? '127.0.0.1' : host;
  const hostPart = target.includes(':') ? `[${target}]` : target;
  try {
    const response = await fetcher(`http://${hostPart}:${port}/api/readiness`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const report = (await response.json().catch(() => null)) as {
      checks?: Record<string, { ready: boolean; message: string }>;
    } | null;
    if (response.ok) {
      io.out('ready');
      return EXIT_OK;
    }
    const reasons = Object.entries(report?.checks ?? {})
      .filter(([, check]) => !check.ready)
      .map(([name, check]) => `${name}: ${check.message}`);
    io.err(`not ready (HTTP ${response.status})${reasons.length ? `: ${reasons.join(' ')}` : ''}`);
  } catch {
    io.err(`not ready: no answer from the server on port ${port}`);
  }
  return EXIT_FAILURE;
}

export function runVersionCommand(args: readonly string[], io: CommandIo): number {
  assertNoArguments(args, ['--json']);
  const info = getBuildInfo();
  if (args.includes('--json')) {
    io.out(JSON.stringify(info, null, 2));
    return EXIT_OK;
  }
  io.out(`Quro ${info.version}`);
  io.out(`Revision: ${info.revision}`);
  io.out(`Schema: ${info.migrations.latest} (${info.migrations.count} migrations)`);
  io.out(`Runtime: Bun ${info.runtime.bun} on ${info.runtime.platform} ${info.runtime.arch}`);
  return EXIT_OK;
}

import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../constants/time';
import { parseArchiveName } from '../backup/archiveNames';
import { documentKeySegments } from './documentStore';

// What `quro doctor` reports about a running install: background jobs, data freshness, disk space,
// backups and the documents the database refers to. The functions here only read; they classify
// what they find as ok, stale (older than expected), failing, or unknown. Unknown is never
// reported as healthy: a missing record means nothing has proved the job or backup ran.

export type Health = 'ok' | 'warn' | 'fail' | 'unknown';
export type Finding = { id: string; health: Health; message: string };

// ── Background jobs ──────────────────────────────────────────────────────────

export const JOB_SUCCESS_PREFIX = 'scheduler:';
export const JOB_FAILURE_PREFIX = 'scheduler-failed:';

/** How often each job runs. The session cleanup interval is a setting, so it is not listed. */
export const JOB_INTERVAL_MS = {
  'bunq-sync': HOUR_MS,
  'holding-price-sync': DAY_MS,
  'currency-rate-sync': DAY_MS,
  'net-worth-snapshot': DAY_MS,
} as const;

export const JOB_ROWS_SQL = `
  select worker_name as "workerName", last_heartbeat_at as "at"
  from worker_heartbeats
  where worker_name like 'scheduler:%' or worker_name like 'scheduler-failed:%'`;

export type JobRow = { workerName: string; at: Date };
export type JobExpectation = {
  name: string;
  intervalMs: number;
  /** An optional integration outage is a warning; a core job that stops is a failure. */
  core: boolean;
};

// A job that has not succeeded for two intervals plus this slack missed a cycle.
const JOB_SLACK_MS = 10 * MINUTE_MS;
const MISSED_CYCLES = 2;

export function describeAge(ms: number): string {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / MINUTE_MS))} minute(s)`;
  if (ms < DAY_MS * 2) return `${Math.round(ms / HOUR_MS)} hour(s)`;
  return `${Math.round(ms / DAY_MS)} day(s)`;
}

export function classifyJob(job: JobExpectation, rows: readonly JobRow[], now: Date): Finding {
  const id = `jobs.${job.name}`;
  const kind = job.core ? 'core job' : 'optional integration';
  const lastSuccess = rows.find((r) => r.workerName === `${JOB_SUCCESS_PREFIX}${job.name}`)?.at;
  const lastFailure = rows.find((r) => r.workerName === `${JOB_FAILURE_PREFIX}${job.name}`)?.at;
  const bad: Health = job.core ? 'fail' : 'warn';
  if (!lastSuccess) {
    return lastFailure
      ? {
          id,
          health: bad,
          message: `${job.name} (${kind}) has not succeeded yet; it last failed ${describeAge(now.getTime() - lastFailure.getTime())} ago. Check the server log for job.cycle_failed.`,
        }
      : {
          id,
          health: 'unknown',
          message: `${job.name} (${kind}) has not recorded a run. It has not run yet, or the server is not running.`,
        };
  }
  const age = now.getTime() - lastSuccess.getTime();
  if (lastFailure && lastFailure.getTime() > lastSuccess.getTime()) {
    return {
      id,
      health: bad,
      message: `${job.name} (${kind}) is failing: its last cycle failed ${describeAge(now.getTime() - lastFailure.getTime())} ago, after a success ${describeAge(age)} ago. Check the server log for job.cycle_failed.`,
    };
  }
  if (age > MISSED_CYCLES * job.intervalMs + JOB_SLACK_MS) {
    return {
      id,
      health: bad,
      message: `${job.name} (${kind}) is stale: last success ${describeAge(age)} ago, expected every ${describeAge(job.intervalMs)}. Is the server running?`,
    };
  }
  return {
    id,
    health: 'ok',
    message: `${job.name} (${kind}) last succeeded ${describeAge(age)} ago.`,
  };
}

// ── Data freshness ───────────────────────────────────────────────────────────

export const FRESHNESS_SQL = `
  select
    (select max(updated_at) from currency_rates) as "ratesAt",
    (select max(last_sync_at) from bunq_connections) as "bunqAt",
    (select count(*)::int from bunq_connections) as "bunqConnections",
    (select max(snapshot_date)::text from net_worth_snapshots) as "snapshotDate"`;

export type FreshnessFacts = {
  ratesAt: Date | null;
  bunqAt: Date | null;
  bunqConnections: number;
  snapshotDate: string | null;
};

const RATES_STALE_MS = 3 * DAY_MS;
const BUNQ_STALE_MS = 2 * DAY_MS;
const SNAPSHOT_STALE_MS = 3 * DAY_MS;

function classifyRates(ratesAt: Date | null, now: Date): Finding {
  const id = 'freshness.currency_rates';
  if (!ratesAt) {
    return {
      id,
      health: 'unknown',
      message: 'No currency rates are stored yet. Conversions to EUR fail closed until they are.',
    };
  }
  const age = now.getTime() - ratesAt.getTime();
  const stale = age > RATES_STALE_MS;
  return {
    id,
    health: stale ? 'warn' : 'ok',
    message: `Currency rates were last updated ${describeAge(age)} ago${stale ? '; the rate provider may be unreachable' : ''}.`,
  };
}

function classifyBankSync(facts: FreshnessFacts, now: Date): Finding {
  const id = 'freshness.bunq';
  if (!facts.bunqAt) {
    return {
      id,
      health: 'unknown',
      message: `${facts.bunqConnections} bank link(s) have never synced.`,
    };
  }
  const age = now.getTime() - facts.bunqAt.getTime();
  return {
    id,
    health: age > BUNQ_STALE_MS ? 'warn' : 'ok',
    message: `The newest bank sync ran ${describeAge(age)} ago (${facts.bunqConnections} link(s)).`,
  };
}

export function classifyFreshness(facts: FreshnessFacts, now: Date): Finding[] {
  const findings = [classifyRates(facts.ratesAt, now)];
  if (facts.snapshotDate) {
    const age = now.getTime() - Date.parse(`${facts.snapshotDate}T00:00:00Z`);
    findings.push({
      id: 'freshness.net_worth',
      health: age > SNAPSHOT_STALE_MS ? 'warn' : 'ok',
      message: `The newest net worth snapshot is dated ${facts.snapshotDate}.`,
    });
  }
  if (facts.bunqConnections > 0) findings.push(classifyBankSync(facts, now));
  return findings;
}

// ── Disk space ───────────────────────────────────────────────────────────────

const DISK_WARN_FREE_FRACTION = 0.1;
const DISK_FAIL_FREE_FRACTION = 0.03;
const GIBIBYTE = 1024 ** 3;

export type DiskFacts = { freeBytes: number; totalBytes: number };

export function classifyDisk(id: string, label: string, facts: DiskFacts): Finding {
  const free = facts.totalBytes > 0 ? facts.freeBytes / facts.totalBytes : 0;
  const text = `${(facts.freeBytes / GIBIBYTE).toFixed(1)} GiB free of ${(facts.totalBytes / GIBIBYTE).toFixed(1)} GiB (${Math.round(free * 100)}%)`;
  if (free < DISK_FAIL_FREE_FRACTION) {
    return { id, health: 'fail', message: `${label}: ${text}. Writes will fail soon; free space.` };
  }
  if (free < DISK_WARN_FREE_FRACTION) {
    return { id, health: 'warn', message: `${label}: ${text}. Free space before it fills.` };
  }
  return { id, health: 'ok', message: `${label}: ${text}.` };
}

export async function readDiskFacts(
  directory: string,
  read: typeof statfs = statfs,
): Promise<DiskFacts> {
  const info = await read(directory);
  return {
    freeBytes: Number(info.bavail) * Number(info.bsize),
    totalBytes: Number(info.blocks) * Number(info.bsize),
  };
}

// ── Backups ──────────────────────────────────────────────────────────────────

/** A scheduled daily backup is stale after this long; weekly schedules should widen it themselves. */
export const BACKUP_STALE_MS = 2 * DAY_MS;

export function archiveTime(name: string): Date | null {
  const parsed = parseArchiveName(name);
  if (!parsed) return null;
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})Z$/.exec(parsed.stamp);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d!, h, mi, s));
}

/**
 * The newest archive `quro backup` wrote into the directory, by the UTC time in its name. The
 * archive's contents are not read, and its checks are not repeated: use `quro backup verify`.
 */
export async function newestBackup(directory: string): Promise<Date | null> {
  const names = await readdir(directory);
  const times = names.map(archiveTime).filter((t): t is Date => t !== null);
  return times.length === 0 ? null : new Date(Math.max(...times.map((t) => t.getTime())));
}

export function classifyBackup(newest: Date | null, now: Date, reachable = true): Finding {
  const id = 'backup.age';
  if (!reachable) {
    return {
      id,
      health: 'unknown',
      message:
        'The backup directory cannot be read from here, so the age of the last backup is unknown. Mount it into this container, or check the backup job yourself.',
    };
  }
  if (!newest) {
    return {
      id,
      health: 'unknown',
      message: 'No backup archive was found. Run `quro backup`, then schedule it.',
    };
  }
  const age = now.getTime() - newest.getTime();
  return age > BACKUP_STALE_MS
    ? {
        id,
        health: 'warn',
        message: `The newest backup is ${describeAge(age)} old (stale after ${describeAge(BACKUP_STALE_MS)}). Check that the scheduled backup runs.`,
      }
    : { id, health: 'ok', message: `The newest backup is ${describeAge(age)} old.` };
}

// ── Documents the database refers to ─────────────────────────────────────────

export type DocumentChecked = { checked: number; missing: number };

/** Counts the referenced keys with no file under `root`. Changes nothing and reads no content. */
export async function countMissingDocuments(
  root: string,
  keys: readonly string[],
): Promise<DocumentChecked> {
  let missing = 0;
  for (const key of keys) {
    try {
      await stat(join(root, ...documentKeySegments(key)));
    } catch {
      missing += 1;
    }
  }
  return { checked: keys.length, missing };
}

export function classifyDocuments(result: DocumentChecked): Finding {
  const id = 'documents.references';
  if (result.checked === 0) {
    return { id, health: 'ok', message: 'No stored documents are referenced yet.' };
  }
  if (result.missing === 0) {
    return {
      id,
      health: 'ok',
      message: `All ${result.checked} referenced document(s) are in the store.`,
    };
  }
  const everything = result.missing === result.checked;
  return {
    id,
    health: 'fail',
    message: `${result.missing} of ${result.checked} referenced document(s) are missing from the store${everything ? '. The directory looks empty: a bind mount that was lost is recreated empty by Docker' : ''}. Restore the documents from a backup before users open them.`,
  };
}

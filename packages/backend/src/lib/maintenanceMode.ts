import postgres, { type Sql } from 'postgres';
import { getConfig } from '../config';

// Maintenance mode keeps the database and the documents consistent while `quro backup` copies
// them, and keeps writers out while `quro restore` replaces them. It is a PostgreSQL advisory
// lock, so it covers every server and worker process and cannot outlive the command that holds it:
//
// - Every write request and every background job cycle holds the lock in shared mode for as long
//   as it runs. It never waits for it: when the lock is held or requested exclusively, the request
//   is refused with 503 and the job skips its cycle.
// - `quro backup` and `quro restore` take it exclusively. PostgreSQL grants that once every shared
//   holder has released it, so running writes drain first.
// - The lock belongs to a database session. If the command dies, PostgreSQL releases it.
//
// Each process takes its shared locks on one dedicated connection. Session-level advisory locks
// stack, so concurrent requests each add and remove one hold, and no request keeps a connection
// to itself while it runs (a slow client cannot exhaust a pool). A session that already holds a
// lock could keep taking it while an exclusive request waits, so admission first looks for an
// exclusive request in pg_locks; from the moment one is queued, new writes are refused and the
// running ones drain.
//
// The two-integer form of the advisory lock functions has its own key space, so these keys never
// collide with the single-key locks the schedulers use.

/** "QRO" in ASCII: the namespace of the application's two-key advisory locks. */
export const QURO_LOCK_NAMESPACE = 0x51_52_4f;
export const MAINTENANCE_LOCK_ID = 1;

const LOCK_NOT_AVAILABLE = '55P03';
const GATE_CLOSE_TIMEOUT_SECONDS = 5;

export type MaintenanceOutcome<T> = { ran: true; value: T } | { ran: false };

let gateClient: Sql | undefined;

// One connection that is never recycled while it may hold locks: postgres.js otherwise closes
// connections after an idle period and after a random lifetime.
function gate(): Sql {
  gateClient ??= postgres(getConfig().runtimeDatabase.url.reveal(), {
    max: 1,
    idle_timeout: 0,
    max_lifetime: 0,
    onnotice: () => undefined,
    connection: { application_name: 'quro-write-gate' },
  });
  return gateClient;
}

/** Whether `quro backup` or `quro restore` holds maintenance mode or is waiting for it. */
function exclusiveRequested(sql: Sql) {
  return sql`exists(
    select 1 from pg_locks
    where locktype = 'advisory' and mode = 'ExclusiveLock'
      and database = (select oid from pg_database where datname = current_database())
      and classid = ${QURO_LOCK_NAMESPACE} and objid = ${MAINTENANCE_LOCK_ID} and objsubid = 2
  )`;
}

/** Whether maintenance mode is on or starting, without taking part in it. */
export async function maintenanceRequested(sql: Sql = gate()): Promise<boolean> {
  const [row] = await sql<{ requested: boolean }[]>`select ${exclusiveRequested(sql)} as requested`;
  return row?.requested ?? false;
}

/**
 * Runs `work` while holding the maintenance lock in shared mode, or returns `{ ran: false }`
 * without running it when maintenance mode is on or starting. The hold is released when `work`
 * ends, whatever it does.
 */
export async function runUnlessMaintenance<T>(
  work: () => Promise<T>,
  sql: Sql = gate(),
): Promise<MaintenanceOutcome<T>> {
  const [row] = await sql<{ admitted: boolean }[]>`
    select case when ${exclusiveRequested(sql)} then false
      else pg_try_advisory_lock_shared(${QURO_LOCK_NAMESPACE}, ${MAINTENANCE_LOCK_ID}) end as admitted
  `;
  if (!row?.admitted) return { ran: false };
  try {
    return { ran: true, value: await work() };
  } finally {
    // A lost connection has released every hold already.
    await sql`select pg_advisory_unlock_shared(${QURO_LOCK_NAMESPACE}, ${MAINTENANCE_LOCK_ID})`.catch(
      () => undefined,
    );
  }
}

/** Closes the gate's connection; the next gated call opens a new one. */
export async function closeMaintenanceGate(): Promise<void> {
  const client = gateClient;
  gateClient = undefined;
  await client?.end({ timeout: GATE_CLOSE_TIMEOUT_SECONDS });
}

/** Maintenance mode could not start in time: writes or job cycles were still running. */
export class MaintenanceTimeoutError extends Error {
  constructor(
    readonly waitedSeconds: number,
    readonly stillRunning: number,
  ) {
    super(
      `Changes did not pause within ${waitedSeconds} seconds: requests or background jobs were still running in ${stillRunning} process(es).`,
    );
    this.name = 'MaintenanceTimeoutError';
  }
}

async function countSharedHolders(session: Sql): Promise<number> {
  const [row] = await session<{ count: number }[]>`
    select count(*)::int as count from pg_locks
    where locktype = 'advisory' and granted and mode = 'ShareLock'
      and database = (select oid from pg_database where datname = current_database())
      and classid = ${QURO_LOCK_NAMESPACE} and objid = ${MAINTENANCE_LOCK_ID} and objsubid = 2
  `;
  return row?.count ?? 0;
}

/**
 * Turns maintenance mode on for the session (a client with one connection): new writes and job
 * cycles are refused at once, and this waits up to `waitSeconds` for running ones to finish.
 */
export async function enterMaintenance(session: Sql, waitSeconds: number): Promise<void> {
  await session`select set_config('lock_timeout', ${`${waitSeconds}s`}, false)`;
  try {
    await session`select pg_advisory_lock(${QURO_LOCK_NAMESPACE}, ${MAINTENANCE_LOCK_ID})`;
  } catch (error) {
    if ((error as { code?: unknown }).code !== LOCK_NOT_AVAILABLE) throw error;
    throw new MaintenanceTimeoutError(waitSeconds, await countSharedHolders(session));
  } finally {
    // A broken connection has already released everything; keep the original error.
    await session`select set_config('lock_timeout', '0', false)`.catch(() => undefined);
  }
}

/** Turns maintenance mode off again. Closing the session does the same. */
export async function leaveMaintenance(session: Sql): Promise<void> {
  await session`select pg_advisory_unlock(${QURO_LOCK_NAMESPACE}, ${MAINTENANCE_LOCK_ID})`;
}

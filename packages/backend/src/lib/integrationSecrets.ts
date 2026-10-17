import { asc, eq } from 'drizzle-orm';
import type { DbExecutor, DbTransaction } from '../db/client';
import { bunqConnections } from '../db/schema';
import {
  classifySecret,
  envelopeKeyId,
  isEnvelope,
  openSecret,
  SecretUnreadableError,
  type SecretPlace,
  type SecretsKey,
  type SecretsKeyring,
  type SecretState,
} from './secretEnvelope';

// Integration secrets are the bank-link credentials Quro keeps for bunq: four text columns of
// `bunq_connections`. Every one is stored as an envelope (lib/secretEnvelope.ts) sealed with the
// operator's secrets key and bound to its column and its row's owner (the user id, unique in that
// table). This module holds that inventory, reads its state for `quro secrets status` and
// `quro doctor`, and moves rows to the current key for `quro secrets encrypt` and `rotate`.
//
// Rows are changed one at a time, each in its own transaction that locks the row, reads it again,
// and writes every changed column in one UPDATE. An interrupted run leaves each row either as it
// was or fully converted, and the next run continues with the rows that still need it.

const SECRETS_TABLE = 'bunq_connections';

/** Every column that holds an integration secret. `server_public_key` is public; not listed. */
export const SECRET_COLUMNS = [
  { column: 'access_token', field: 'accessToken' },
  { column: 'private_key', field: 'privateKey' },
  { column: 'installation_token', field: 'installationToken' },
  { column: 'session_token', field: 'sessionToken' },
] as const;

export type SecretField = (typeof SECRET_COLUMNS)[number]['field'];
export type SecretColumn = (typeof SECRET_COLUMNS)[number]['column'];

/** One `bunq_connections` row as far as its secrets are concerned. */
export type SecretRow = { id: number; userId: number } & Record<SecretField, string | null>;

export function secretPlace(column: SecretColumn, ownerId: number): SecretPlace {
  return { table: SECRETS_TABLE, column, ownerId };
}

const SECRET_ROW_COLUMNS = {
  id: bunqConnections.id,
  userId: bunqConnections.userId,
  accessToken: bunqConnections.accessToken,
  privateKey: bunqConnections.privateKey,
  installationToken: bunqConnections.installationToken,
  sessionToken: bunqConnections.sessionToken,
};

export function readSecretRows(executor: DbExecutor): Promise<SecretRow[]> {
  return executor.select(SECRET_ROW_COLUMNS).from(bunqConnections).orderBy(asc(bunqConnections.id));
}

// ── Status ─────────────────────────────────────────────────────────────────

/** Counts of stored secrets (non-null columns) by state. */
type SecretCounts = {
  total: number;
  /** Sealed with the current key and verified by opening it. */
  current: number;
  /** Sealed with the previous key (rotation pending) and verified by opening it. */
  previous: number;
  unencrypted: number;
  /** Sealed with a key that is not configured. */
  unknownKey: number;
  /** Damaged, moved from another row or column, or failing the tag check. */
  unreadable: number;
};

type SecretsStatus =
  /** Nothing stored. */
  | 'none'
  /** Every stored secret is sealed with the current key and opens. */
  | 'current'
  /** Some are sealed with the previous key: `quro secrets rotate`. */
  | 'rotation_pending'
  /** Some are stored unencrypted: `quro secrets encrypt`. */
  | 'unencrypted'
  /** Some cannot be opened with the configured keys: their users reconnect bunq. */
  | 'unreadable';

export type SecretsReport = {
  status: SecretsStatus;
  connections: number;
  secrets: SecretCounts;
  /** Key ids found in envelopes that no configured key matches. */
  unknownKeyIds: string[];
  /** Users whose bank link cannot be opened and must be connected again (ids only). */
  reconnectUserIds: number[];
};

function emptyCounts(): SecretCounts {
  return { total: 0, current: 0, previous: 0, unencrypted: 0, unknownKey: 0, unreadable: 0 };
}

function overallStatus(counts: SecretCounts): SecretsStatus {
  if (counts.total === 0) return 'none';
  if (counts.unknownKey > 0 || counts.unreadable > 0) return 'unreadable';
  if (counts.unencrypted > 0) return 'unencrypted';
  if (counts.previous > 0) return 'rotation_pending';
  return 'current';
}

/** The state of one value, opening it when a configured key matches so a bad tag is found. */
function verifiedState(value: string, place: SecretPlace, keyring: SecretsKeyring): SecretState {
  const state = classifySecret(value, keyring);
  if (state !== 'current' && state !== 'previous') return state;
  try {
    openSecret(value, place, keyring);
    return state;
  } catch (error) {
    if (error instanceof SecretUnreadableError) return 'malformed';
    throw error;
  }
}

/**
 * Classifies every stored secret without printing or keeping any value. Values sealed with a
 * configured key are opened in memory to check their tag; nothing is written.
 */
export function summarizeSecrets(
  rows: readonly SecretRow[],
  keyring: SecretsKeyring,
): SecretsReport {
  const counts = emptyCounts();
  const unknownKeyIds = new Set<string>();
  const reconnect = new Set<number>();
  for (const row of rows) {
    for (const { column, field } of SECRET_COLUMNS) {
      const value = row[field];
      if (value === null) continue;
      counts.total += 1;
      const state = verifiedState(value, secretPlace(column, row.userId), keyring);
      if (state === 'malformed') {
        counts.unreadable += 1;
        reconnect.add(row.userId);
      } else if (state === 'unknownKey') {
        counts.unknownKey += 1;
        unknownKeyIds.add(envelopeKeyId(value)!);
        reconnect.add(row.userId);
      } else {
        counts[state] += 1;
      }
    }
  }
  return {
    status: overallStatus(counts),
    connections: rows.length,
    secrets: counts,
    unknownKeyIds: [...unknownKeyIds].sort(),
    reconnectUserIds: [...reconnect].sort((a, b) => a - b),
  };
}

/** Key ids of every envelope, and the number of unencrypted values: for backup manifests. */
export function sealedKeyIds(rows: readonly SecretRow[]): {
  keyIds: string[];
  unencrypted: number;
} {
  const keyIds = new Set<string>();
  let unencrypted = 0;
  for (const row of rows) {
    for (const { field } of SECRET_COLUMNS) {
      const value = row[field];
      if (value === null) continue;
      const keyId = envelopeKeyId(value);
      if (keyId) keyIds.add(keyId);
      else if (!isEnvelope(value)) unencrypted += 1;
    }
  }
  return { keyIds: [...keyIds].sort(), unencrypted };
}

// ── Encrypt and rotate ─────────────────────────────────────────────────────

/** `encrypt`: unencrypted values only. `rotate`: also values sealed with the previous key. */
export type SealMode = 'encrypt' | 'rotate';

export type RowOutcome = {
  id: number;
  userId: number;
  /** Columns written in this row's transaction. */
  sealed: SecretColumn[];
  /** Columns left as they were because they cannot be opened (or, for `encrypt`, need rotating). */
  left: Array<{ column: SecretColumn; state: SecretState | 'unreadable' }>;
};

/** The value a column gets in `mode`, or null to leave it unchanged. */
function nextValue(
  value: string,
  place: SecretPlace,
  key: SecretsKey,
  keyring: SecretsKeyring,
  mode: SealMode,
): { value: string } | { left: SecretState | 'unreadable' } | null {
  const state = classifySecret(value, keyring);
  if (state === 'current') return null;
  if (state === 'unencrypted') return { value: key.seal(value, place) };
  if (state !== 'previous' || mode !== 'rotate') return { left: state };
  try {
    return { value: key.seal(openSecret(value, place, keyring).value, place) };
  } catch (error) {
    if (error instanceof SecretUnreadableError) return { left: 'unreadable' };
    throw error;
  }
}

/**
 * Converts one row inside `tx`: locks it, reads it again, and writes every column that needs the
 * current key in one UPDATE. Returns null when the row no longer exists.
 */
export async function sealRow(
  tx: DbTransaction,
  id: number,
  keyring: SecretsKeyring & { current: SecretsKey },
  mode: SealMode,
): Promise<RowOutcome | null> {
  const [row] = await tx
    .select(SECRET_ROW_COLUMNS)
    .from(bunqConnections)
    .where(eq(bunqConnections.id, id))
    .for('update');
  if (!row) return null;
  const outcome: RowOutcome = { id: row.id, userId: row.userId, sealed: [], left: [] };
  const changes: Partial<Record<SecretField, string>> = {};
  for (const { column, field } of SECRET_COLUMNS) {
    const value = row[field];
    if (value === null) continue;
    const next = nextValue(value, secretPlace(column, row.userId), keyring.current, keyring, mode);
    if (next === null) continue;
    if ('left' in next) outcome.left.push({ column, state: next.left });
    else {
      changes[field] = next.value;
      outcome.sealed.push(column);
    }
  }
  if (outcome.sealed.length > 0) {
    await tx.update(bunqConnections).set(changes).where(eq(bunqConnections.id, id));
  }
  return outcome;
}

export type SealReport = {
  rows: number;
  /** Rows with at least one column written. */
  changedRows: number;
  sealedSecrets: number;
  /** Columns left unchanged, with their row's owner. */
  left: Array<RowOutcome['left'][number] & { userId: number }>;
};

export type SealHooks = {
  /** Runs inside a row's transaction after its UPDATE, before the commit. For tests. */
  beforeCommit?: (outcome: RowOutcome) => Promise<void> | void;
  /** Runs after a row's transaction has committed. */
  afterRow?: (outcome: RowOutcome) => Promise<void> | void;
};

/**
 * Brings every row to the current key, one transaction per row, in id order. Stops at the first
 * error; rows committed before it stay converted and a new run skips them.
 */
export async function sealAllRows(
  database: {
    transaction: <T>(work: (tx: DbTransaction) => Promise<T>) => Promise<T>;
  } & DbExecutor,
  keyring: SecretsKeyring & { current: SecretsKey },
  mode: SealMode,
  hooks: SealHooks = {},
): Promise<SealReport> {
  const ids = await database
    .select({ id: bunqConnections.id })
    .from(bunqConnections)
    .orderBy(asc(bunqConnections.id));
  const report: SealReport = { rows: 0, changedRows: 0, sealedSecrets: 0, left: [] };
  for (const { id } of ids) {
    const outcome = await database.transaction(async (tx) => {
      const result = await sealRow(tx, id, keyring, mode);
      if (result) await hooks.beforeCommit?.(result);
      return result;
    });
    if (!outcome) continue;
    report.rows += 1;
    if (outcome.sealed.length > 0) report.changedRows += 1;
    report.sealedSecrets += outcome.sealed.length;
    report.left.push(...outcome.left.map((entry) => ({ ...entry, userId: outcome.userId })));
    await hooks.afterRow?.(outcome);
  }
  return report;
}

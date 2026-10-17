import { eq } from 'drizzle-orm';
import { getConfig } from '../config';
import { db } from '../db/client';
import { bunqConnections } from '../db/schema';
import {
  createInstallation,
  createSession,
  generateKeyPair,
  registerDevice,
  type BunqSessionResult,
} from './bunqClient';
import { SECRET_COLUMNS, sealRow, secretPlace, type SecretColumn } from './integrationSecrets';
import {
  classifySecret,
  openSecret,
  SecretUnreadableError,
  type SecretsKey,
  type SecretsKeyring,
} from './secretEnvelope';
import { log } from './logger';

// The bank-link credentials of one user, opened for a sync and sealed again whenever they change.
// Nothing outside this module reads or writes the secret columns of `bunq_connections` directly
// (the OAuth callback seals its token through `sealBunqSecret`).

export const BUNQ_REAUTHORIZE_MESSAGE =
  'The stored bunq credentials cannot be read with this instance’s secrets key. Reconnect bunq in Settings.';

/** The stored credentials cannot be opened: the user has to connect bunq again. */
export class BunqCredentialsUnavailableError extends Error {
  readonly reason: SecretUnreadableError['reason'];

  constructor(unreadable: SecretUnreadableError) {
    super(BUNQ_REAUTHORIZE_MESSAGE, { cause: unreadable });
    this.name = 'BunqCredentialsUnavailableError';
    this.reason = unreadable.reason;
  }
}

type ConnectionRow = typeof bunqConnections.$inferSelect;

type BunqCredentials = {
  accessToken: string;
  privateKey: string | null;
  installationToken: string | null;
  sessionToken: string | null;
};

/** A connection's metadata with its credentials opened. Never written back as it is. */
export type OpenBunqConnection = Omit<ConnectionRow, keyof BunqCredentials> & {
  credentials: BunqCredentials;
};

type CurrentKeyring = SecretsKeyring & { current: SecretsKey };

function keyring(): CurrentKeyring {
  const { key, previousKey } = getConfig().secrets;
  // bunq linking cannot be configured without a key (see src/config), so this is a broken setup.
  if (!key) throw new Error('No secrets key is configured (QRO_SECRETS_KEY_FILE).');
  return { current: key, previous: previousKey };
}

/** Seals one credential for its column and owner with the current key. */
export function sealBunqSecret(column: SecretColumn, userId: number, value: string): string {
  return keyring().current.seal(value, secretPlace(column, userId));
}

function openCredentials(row: ConnectionRow, keys: CurrentKeyring): BunqCredentials {
  const open = (column: SecretColumn, value: string | null) =>
    value === null ? null : openSecret(value, secretPlace(column, row.userId), keys).value;
  try {
    return {
      accessToken: open('access_token', row.accessToken)!,
      privateKey: open('private_key', row.privateKey),
      installationToken: open('installation_token', row.installationToken),
      sessionToken: open('session_token', row.sessionToken),
    };
  } catch (error) {
    if (error instanceof SecretUnreadableError) throw new BunqCredentialsUnavailableError(error);
    throw error;
  }
}

function hasUnencrypted(row: ConnectionRow, keys: CurrentKeyring): boolean {
  return SECRET_COLUMNS.some(({ field }) => {
    const value = row[field];
    return value !== null && classifySecret(value, keys) === 'unencrypted';
  });
}

/**
 * Opens the credentials, or records on the connection that the user has to reconnect (what
 * Settings shows as the sync error) before throwing.
 */
async function openOrMarkFailed(row: ConnectionRow, keys: CurrentKeyring) {
  try {
    return openCredentials(row, keys);
  } catch (error) {
    if (error instanceof BunqCredentialsUnavailableError) {
      await db
        .update(bunqConnections)
        .set({ syncStatus: 'error', syncError: BUNQ_REAUTHORIZE_MESSAGE })
        .where(eq(bunqConnections.id, row.id));
    }
    throw error;
  }
}

async function selectConnection(userId: number): Promise<ConnectionRow | null> {
  const [row] = await db.select().from(bunqConnections).where(eq(bunqConnections.userId, userId));
  return row ?? null;
}

/**
 * Loads a user's connection with its credentials opened, or null without one. A connection that
 * still holds unencrypted credentials (stored before encryption, or restored from such a backup)
 * is encrypted in place first, the way `quro secrets encrypt` does it, so the server never keeps
 * using plaintext. Throws `BunqCredentialsUnavailableError` when a credential cannot be opened.
 */
export async function loadBunqConnection(userId: number): Promise<OpenBunqConnection | null> {
  const keys = keyring();
  let row = await selectConnection(userId);
  if (!row) return null;
  if (hasUnencrypted(row, keys)) {
    const id = row.id;
    const outcome = await db.transaction((tx) => sealRow(tx, id, keys, 'encrypt'));
    if (outcome && outcome.sealed.length > 0) {
      log.info('bunq.credentials_encrypted', {
        userId,
        count: outcome.sealed.length,
        keyId: keys.current.id,
      });
    }
    row = await selectConnection(userId);
    if (!row) return null;
  }
  const credentials = await openOrMarkFailed(row, keys);
  return {
    id: row.id,
    userId: row.userId,
    serverPublicKey: row.serverPublicKey,
    sessionId: row.sessionId,
    sessionExpiresAt: row.sessionExpiresAt,
    bunqUserId: row.bunqUserId,
    lastSyncAt: row.lastSyncAt,
    syncStatus: row.syncStatus,
    syncError: row.syncError,
    createdAt: row.createdAt,
    credentials,
  };
}

function isSessionValid(connection: OpenBunqConnection): boolean {
  const { sessionToken } = connection.credentials;
  if (!sessionToken || !connection.sessionExpiresAt) return false;
  return connection.sessionExpiresAt.getTime() > Date.now();
}

async function bootstrapApiContext(connection: OpenBunqConnection): Promise<{
  installationToken: string;
  privateKey: string;
}> {
  const { installationToken, privateKey, accessToken } = connection.credentials;
  if (installationToken && privateKey) return { installationToken, privateKey };

  const keyPair = generateKeyPair();
  const installation = await createInstallation(keyPair.publicKey);
  const { userId } = connection;

  await db
    .update(bunqConnections)
    .set({
      privateKey: sealBunqSecret('private_key', userId, keyPair.privateKey),
      installationToken: sealBunqSecret(
        'installation_token',
        userId,
        installation.installationToken,
      ),
      serverPublicKey: installation.serverPublicKey,
    })
    .where(eq(bunqConnections.id, connection.id));

  await registerDevice(installation.installationToken, accessToken, keyPair.privateKey);

  return { installationToken: installation.installationToken, privateKey: keyPair.privateKey };
}

/** A valid bunq API session for the connection, creating (and storing) a new one when needed. */
export async function ensureBunqSession(
  connection: OpenBunqConnection,
): Promise<BunqSessionResult> {
  const { sessionToken } = connection.credentials;
  if (isSessionValid(connection) && connection.bunqUserId) {
    return {
      sessionToken: sessionToken!,
      sessionId: connection.sessionId,
      bunqUserId: connection.bunqUserId,
      expiresAt: connection.sessionExpiresAt!,
    };
  }

  const { installationToken, privateKey } = await bootstrapApiContext(connection);
  const session = await createSession(
    installationToken,
    connection.credentials.accessToken,
    privateKey,
  );

  await db
    .update(bunqConnections)
    .set({
      sessionToken: sealBunqSecret('session_token', connection.userId, session.sessionToken),
      sessionId: session.sessionId,
      sessionExpiresAt: session.expiresAt,
      bunqUserId: session.bunqUserId,
    })
    .where(eq(bunqConnections.id, connection.id));

  return session;
}

/**
 * The stored bunq session of a user, for ending it when they disconnect. Null when there is none
 * or it cannot be opened: the connection is then removed without ending the session at bunq,
 * which expires on its own.
 */
export async function readStoredSession(
  userId: number,
): Promise<{ sessionToken: string; sessionId: number } | null> {
  const [row] = await db
    .select({ sessionToken: bunqConnections.sessionToken, sessionId: bunqConnections.sessionId })
    .from(bunqConnections)
    .where(eq(bunqConnections.userId, userId));
  if (!row?.sessionToken || row.sessionId === null) return null;
  try {
    const opened = openSecret(row.sessionToken, secretPlace('session_token', userId), keyring());
    return { sessionToken: opened.value, sessionId: row.sessionId };
  } catch (error) {
    if (!(error instanceof SecretUnreadableError)) throw error;
    log.warn('bunq.session_unreadable', { userId, reason: error.reason });
    return null;
  }
}

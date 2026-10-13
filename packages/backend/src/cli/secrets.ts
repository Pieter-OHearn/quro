import { assertConfig, ConfigError, type SecretsConfig } from '../config';
import { classifyDatabaseError, describeDatabaseError, errorCode } from '../db/connectionErrors';
import {
  readSecretRows,
  sealAllRows,
  summarizeSecrets,
  type SealHooks,
  type SealMode,
  type SecretsReport,
} from '../lib/integrationSecrets';
import { closeMaintenanceGate, runUnlessMaintenance } from '../lib/maintenanceMode';
import type { SecretsKey } from '../lib/secretEnvelope';
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_UNAVAILABLE,
  EXIT_USAGE,
  UsageError,
  type CommandIo,
} from './io';

// `quro secrets`: the integration secrets Quro stores for bunq (bank-link tokens and keys) and
// the key that encrypts them (docs/security.md, "Integration secrets"). `status` changes nothing;
// `encrypt` and `rotate` convert one connection per transaction, so they can be interrupted and
// run again. No command prints a secret value or key material; key ids are fingerprints.

export const SECRETS_USAGE = `Usage: quro secrets status [--json]
       quro secrets encrypt [--dry-run]
       quro secrets rotate [--dry-run]

Integration secrets are the bank-link tokens and keys Quro stores for connected bunq accounts.
They are encrypted with the key in QRO_SECRETS_KEY_FILE.

Commands:
  status    Counts the stored secrets: encrypted with the current key, with the previous key,
            with a key that is not configured, unencrypted or damaged. Opens each encrypted one
            in memory to check it. Prints no secret value and changes nothing
  encrypt   Encrypts every unencrypted secret with QRO_SECRETS_KEY_FILE
  rotate    Encrypts every secret that QRO_SECRETS_PREVIOUS_KEY_FILE opens (and every
            unencrypted one) with QRO_SECRETS_KEY_FILE

encrypt and rotate change one bank connection per transaction: an interrupted run leaves each
connection as it was or fully converted, and running the command again finishes the rest. They
pause like any other change while \`quro backup\` or \`quro restore\` runs.

Options:
  --json      With status: print one JSON object
  --dry-run   With encrypt or rotate: print what would change, change nothing

Exit codes: 0 done (status: every stored secret is encrypted with the current key, or none is
stored), 1 failed or work remains (status: the report says what to run), 2 invalid usage or
settings (encrypt needs QRO_SECRETS_KEY_FILE; rotate also QRO_SECRETS_PREVIOUS_KEY_FILE),
4 database unreachable.`;

const JSON_INDENT = 2;

type Command = 'status' | 'encrypt' | 'rotate';
type Args = { command: Command; json: boolean; dryRun: boolean };

export function parseSecretsArgs(args: readonly string[]): Args {
  const [command, ...options] = args;
  if (command !== 'status' && command !== 'encrypt' && command !== 'rotate') {
    throw new UsageError(command ? `Unknown command: secrets ${command}` : 'Missing command');
  }
  const parsed: Args = { command, json: false, dryRun: false };
  for (const option of options) {
    if (option === '--json' && command === 'status') parsed.json = true;
    else if (option === '--dry-run' && command !== 'status') parsed.dryRun = true;
    else throw new UsageError(`Unknown argument: ${option}`);
  }
  return parsed;
}

const STATUS_MESSAGES: Record<SecretsReport['status'], string> = {
  none: 'No integration secrets are stored.',
  current: 'Every stored integration secret is encrypted with the current key.',
  rotation_pending:
    'Some secrets are still encrypted with the previous key. Run `quro secrets rotate`.',
  unencrypted: 'Some secrets are stored unencrypted. Run `quro secrets encrypt`.',
  unreadable:
    'Some secrets cannot be opened with the configured keys. Configure the key they were encrypted with, or have the users listed above connect bunq again in Settings.',
};

const EXIT_BY_STATUS: Record<SecretsReport['status'], number> = {
  none: EXIT_OK,
  current: EXIT_OK,
  rotation_pending: EXIT_FAILURE,
  unencrypted: EXIT_FAILURE,
  unreadable: EXIT_FAILURE,
};

export function describeKeys(secrets: SecretsConfig): string[] {
  const lines = [
    secrets.key
      ? `Secrets key: ${secrets.key.id} (from ${secrets.keyPath}).`
      : 'Secrets key: not configured (QRO_SECRETS_KEY_FILE).',
  ];
  if (secrets.previousKey) lines.push(`Previous key: ${secrets.previousKey.id}.`);
  return lines;
}

export function statusMessage(report: SecretsReport): string {
  return STATUS_MESSAGES[report.status];
}

/** The report's lines for people; JSON carries the same facts. */
export function describeReport(report: SecretsReport): string[] {
  const { secrets: counts } = report;
  const lines = [
    `bunq connections: ${report.connections}, holding ${counts.total} stored secret(s).`,
  ];
  if (counts.total > 0) {
    lines.push(
      `  encrypted with the current key: ${counts.current}`,
      `  encrypted with the previous key: ${counts.previous}`,
      `  unencrypted: ${counts.unencrypted}`,
      `  encrypted with a key that is not configured: ${counts.unknownKey}${report.unknownKeyIds.length > 0 ? ` (key ${report.unknownKeyIds.join(', ')})` : ''}`,
      `  damaged, moved or failing their check: ${counts.unreadable}`,
    );
  }
  if (report.reconnectUserIds.length > 0) {
    lines.push(`Users whose bank link cannot be opened: ${report.reconnectUserIds.join(', ')}.`);
  }
  lines.push(`Status: ${report.status}. ${statusMessage(report)}`);
  return lines;
}

function databaseFailure(error: unknown, io: CommandIo): number {
  const kind = classifyDatabaseError(error);
  io.err(
    `The database ${kind === 'unreachable' ? 'cannot be reached' : 'refused the command'}: ${describeDatabaseError(error)}.`,
  );
  if (kind === 'unreachable') return EXIT_UNAVAILABLE;
  return kind === 'rejected' ? EXIT_USAGE : EXIT_FAILURE;
}

async function runStatus(json: boolean, io: CommandIo): Promise<number> {
  const { secrets } = assertConfig('secrets');
  const { db } = await import('../db/client');
  const report = summarizeSecrets(await readSecretRows(db), {
    current: secrets.key,
    previous: secrets.previousKey,
  });
  const exitCode = EXIT_BY_STATUS[report.status];
  if (json) {
    io.out(
      JSON.stringify(
        {
          status: report.status,
          message: statusMessage(report),
          key: { configured: secrets.key !== null, id: secrets.key?.id ?? null },
          previousKey: {
            configured: secrets.previousKey !== null,
            id: secrets.previousKey?.id ?? null,
          },
          connections: report.connections,
          secrets: report.secrets,
          unknownKeyIds: report.unknownKeyIds,
          reconnectUserIds: report.reconnectUserIds,
          exitCode,
        },
        null,
        JSON_INDENT,
      ),
    );
  } else {
    for (const line of [...describeKeys(secrets), ...describeReport(report)]) io.out(line);
  }
  return exitCode;
}

/** The keys `encrypt` and `rotate` need, or a settings problem (exit code 2). */
function requireKeys(
  mode: SealMode,
  secrets: SecretsConfig,
): { current: SecretsKey; previous: SecretsKey | null } {
  if (!secrets.key) {
    throw new ConfigError([
      {
        setting: 'QRO_SECRETS_KEY_FILE',
        message: `required for \`quro secrets ${mode}\`: no key file at ${secrets.keyPath ?? '/run/secrets/secrets_key'}`,
      },
    ]);
  }
  if (mode === 'rotate' && !secrets.previousKey) {
    throw new ConfigError([
      {
        setting: 'QRO_SECRETS_PREVIOUS_KEY_FILE',
        message:
          'required for `quro secrets rotate`: the file holding the key that was in use before',
      },
    ]);
  }
  return { current: secrets.key, previous: secrets.previousKey };
}

export type SealOverrides = { hooks?: SealHooks };

async function runSeal(
  mode: SealMode,
  dryRun: boolean,
  io: CommandIo,
  overrides: SealOverrides,
): Promise<number> {
  const { secrets } = assertConfig('secrets');
  const keyring = requireKeys(mode, secrets);
  const { db } = await import('../db/client');
  for (const line of describeKeys(secrets)) io.out(line);
  const before = summarizeSecrets(await readSecretRows(db), keyring);
  const pending = before.secrets.unencrypted + (mode === 'rotate' ? before.secrets.previous : 0);
  if (dryRun) {
    for (const line of describeReport(before)) io.out(line);
    io.out(
      `Would encrypt ${pending} secret(s) with key ${keyring.current.id}. Nothing was changed.`,
    );
    return EXIT_OK;
  }
  if (pending === 0) {
    io.out(`Nothing to ${mode}.`);
  } else {
    const outcome = await runUnlessMaintenance(() =>
      sealAllRows(db, keyring, mode, overrides.hooks),
    );
    if (!outcome.ran) {
      io.err(
        'Quro is being backed up or restored, so changes are paused. Run the command again when it has finished.',
      );
      return EXIT_FAILURE;
    }
    const { changedRows, sealedSecrets } = outcome.value;
    io.out(
      `Encrypted ${sealedSecrets} secret(s) in ${changedRows} bank connection(s) with key ${keyring.current.id}.`,
    );
  }
  const after = summarizeSecrets(await readSecretRows(db), keyring);
  for (const line of describeReport(after)) io.out(line);
  const remaining = after.secrets.unencrypted + (mode === 'rotate' ? after.secrets.previous : 0);
  return remaining === 0 ? EXIT_OK : EXIT_FAILURE;
}

export async function runSecretsCommand(
  args: readonly string[],
  io: CommandIo,
  overrides: SealOverrides = {},
): Promise<number> {
  if (args.includes('--help')) {
    io.out(SECRETS_USAGE);
    return EXIT_OK;
  }
  const { command, json, dryRun } = parseSecretsArgs(args);
  try {
    if (command === 'status') return await runStatus(json, io);
    return await runSeal(command, dryRun, io, overrides);
  } catch (error) {
    if (error instanceof ConfigError || error instanceof UsageError) throw error;
    // A driver or server error carries a code; anything else is a bug and keeps its stack.
    if (errorCode(error) !== '') return databaseFailure(error, io);
    throw error;
  } finally {
    await closeMaintenanceGate().catch(() => undefined);
  }
}

import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, users } from '../db/schema';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../constants/time';
import {
  issuePasswordResetCode,
  issueRegistrationCode,
  listAuthCodes,
  PASSWORD_RESET_CODE_TTL_MS,
  REGISTRATION_CODE_TTL_MS,
  revokeAuthCode,
} from '../lib/authCodes';
import { getRegistrationMode, getRegistrationPolicy } from '../lib/registration';
import { revokeUserSessions } from '../lib/sessions';
import { EXIT_FAILURE, EXIT_OK, UsageError, type CommandIo } from './io';

// Instance-operator commands. Operator authority comes from host access to the backend's
// runtime configuration and database; there is no in-app operator role. Commands show account
// metadata only, never household or financial data.

const MAX_INVITE_DAYS = 30;
const MAX_INVITE_HOURS = (MAX_INVITE_DAYS * DAY_MS) / HOUR_MS;
const MAX_RESET_MINUTES = DAY_MS / MINUTE_MS;
const OPTION_PREFIX = '--';

export const USER_USAGE = `Usage: quro user <command> [options]

Commands:
  status                                 Registration mode, setup state and code counts
  invite [--hours <n>]                   Issue a single-use registration code (default ${REGISTRATION_CODE_TTL_MS / HOUR_MS} h, max ${MAX_INVITE_HOURS} h).
                                         The first account of a new instance needs one in every mode.
  reset-password <email> [--minutes <n>] Issue a single-use password reset code (default ${PASSWORD_RESET_CODE_TTL_MS / MINUTE_MS} min, max ${MAX_RESET_MINUTES} min)
  revoke-sessions <email>                Sign an account out of every browser
  list                                   List accounts with their active session count
  codes                                  List issued codes (code values are never stored)
  revoke-code <id>                       Withdraw an unused code

In Docker Compose: docker compose exec backend quro user <command>`;

type ParsedArgs = { positionals: string[]; options: Map<string, string> };

function parseArgs(args: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith(OPTION_PREFIX)) {
      positionals.push(arg);
      continue;
    }
    const [name = '', ...inlineParts] = arg.slice(OPTION_PREFIX.length).split('=');
    const inline = inlineParts.length > 0;
    const value = inline ? inlineParts.join('=') : args[i + 1];
    if (!name || value === undefined || value.startsWith(OPTION_PREFIX)) {
      throw new UsageError(`Missing value for --${name}`);
    }
    if (!inline) i += 1;
    options.set(name, value);
  }
  return { positionals, options };
}

function readDuration(parsed: ParsedArgs, name: string, max: number): number | undefined {
  const raw = parsed.options.get(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > max) {
    throw new UsageError(`--${name} must be a whole number from 1 to ${max}`);
  }
  return value;
}

function assertOnlyOptions(parsed: ParsedArgs, allowed: readonly string[]) {
  for (const name of parsed.options.keys()) {
    if (!allowed.includes(name)) throw new UsageError(`Unknown option --${name}`);
  }
}

/** Rejects arguments beyond the command name and the named ones it takes. */
function assertArguments(parsed: ParsedArgs, names: readonly string[]) {
  const extra = parsed.positionals[names.length + 1];
  if (extra !== undefined) throw new UsageError(`Unexpected argument: ${extra}`);
}

function formatTime(date: Date): string {
  return `${date
    .toISOString()
    .replace('T', ' ')
    .replace(/:\d{2}\.\d{3}Z$/, '')} UTC`;
}

async function findUserIdByEmail(rawEmail: string | undefined): Promise<number | null> {
  if (!rawEmail) throw new UsageError('An email address is required');
  const email = rawEmail.trim().toLowerCase();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return user?.id ?? null;
}

async function status(io: CommandIo) {
  const mode = getRegistrationMode();
  const policy = await getRegistrationPolicy(mode);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  const now = Date.now();
  const pending = (await listAuthCodes()).filter(
    (code) => code.consumedAt === null && code.expiresAt.getTime() > now,
  );
  const pendingOf = (purpose: string) => pending.filter((code) => code.purpose === purpose).length;

  io.out(`Registration mode: ${mode}`);
  io.out(`Sign-up currently: ${policy.signUp === 'code' ? 'requires a code' : policy.signUp}`);
  io.out(`Accounts: ${count}`);
  io.out(
    policy.setupRequired
      ? 'Setup: pending. Run `quro user invite` and use the code to create the first account.'
      : 'Setup: complete',
  );
  io.out(
    `Unused codes: ${pendingOf('registration')} registration, ${pendingOf('password_reset')} password reset`,
  );
}

async function invite(parsed: ParsedArgs, io: CommandIo) {
  assertOnlyOptions(parsed, ['hours']);
  assertArguments(parsed, []);
  const hours = readDuration(parsed, 'hours', MAX_INVITE_HOURS);
  const issued = await issueRegistrationCode({ ttlMs: hours ? hours * HOUR_MS : undefined });
  const mode = getRegistrationMode();
  const policy = await getRegistrationPolicy(mode);

  io.out(`Registration code #${issued.id}, valid until ${formatTime(issued.expiresAt)}:`);
  io.out('');
  io.out(`  ${issued.code}`);
  io.out('');
  io.out('It is shown only once. Share it through a channel you trust; it works for one sign-up.');
  if (!policy.setupRequired && mode === 'closed') {
    io.err('Warning: REGISTRATION_MODE=closed rejects sign-ups, so this code cannot be used.');
  }
}

async function resetPassword(parsed: ParsedArgs, io: CommandIo) {
  assertOnlyOptions(parsed, ['minutes']);
  assertArguments(parsed, ['email']);
  const minutes = readDuration(parsed, 'minutes', MAX_RESET_MINUTES);
  const email = parsed.positionals[1];
  const userId = await findUserIdByEmail(email);
  if (userId === null) {
    io.err(`No account uses ${email}`);
    return EXIT_FAILURE;
  }
  const issued = await issuePasswordResetCode(userId, {
    ttlMs: minutes ? minutes * MINUTE_MS : undefined,
  });

  io.out(`Password reset code for ${email}, valid until ${formatTime(issued.expiresAt)}:`);
  io.out('');
  io.out(`  ${issued.code}`);
  io.out('');
  io.out('It replaces any earlier reset code for this account and is shown only once.');
  io.out('The account holder redeems it with "Forgot password?" on the sign-in screen,');
  io.out('which sets a new password and signs out all of their sessions.');
  return EXIT_OK;
}

async function revokeSessions(parsed: ParsedArgs, io: CommandIo) {
  assertOnlyOptions(parsed, []);
  assertArguments(parsed, ['email']);
  const email = parsed.positionals[1];
  const userId = await findUserIdByEmail(email);
  if (userId === null) {
    io.err(`No account uses ${email}`);
    return EXIT_FAILURE;
  }
  const revoked = await revokeUserSessions(userId, null);
  io.out(`Revoked ${revoked} session${revoked === 1 ? '' : 's'} for ${email}.`);
  return EXIT_OK;
}

async function listUsers(io: CommandIo) {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      activeSessions: sql<number>`count(${sessions.id})::int`,
    })
    .from(users)
    .leftJoin(sessions, and(eq(sessions.userId, users.id), gt(sessions.expiresAt, new Date())))
    .groupBy(users.id)
    .orderBy(asc(users.id));

  if (rows.length === 0) {
    io.out('No accounts yet.');
    return;
  }
  for (const row of rows) {
    io.out(
      `#${row.id}  ${row.email}  created ${formatTime(row.createdAt)}  active sessions: ${row.activeSessions}`,
    );
  }
}

function describeCodeState(code: Awaited<ReturnType<typeof listAuthCodes>>[number], now: number) {
  if (code.consumedAt) {
    const by = code.consumedByUserId === null ? '' : ` by account #${code.consumedByUserId}`;
    return `used ${formatTime(code.consumedAt)}${by}`;
  }
  return code.expiresAt.getTime() > now
    ? `unused, expires ${formatTime(code.expiresAt)}`
    : `expired ${formatTime(code.expiresAt)}`;
}

async function listCodes(io: CommandIo) {
  const codes = await listAuthCodes();
  if (codes.length === 0) {
    io.out('No codes.');
    return;
  }
  const now = Date.now();
  for (const code of codes) {
    const target = code.userId === null ? '' : ` for account #${code.userId}`;
    io.out(`#${code.id}  ${code.purpose}${target}  ${describeCodeState(code, now)}`);
  }
}

async function revokeCode(parsed: ParsedArgs, io: CommandIo) {
  assertOnlyOptions(parsed, []);
  assertArguments(parsed, ['id']);
  const raw = parsed.positionals[1] ?? '';
  if (!/^\d+$/.test(raw)) throw new UsageError('A numeric code id is required');
  if (!(await revokeAuthCode(Number(raw)))) {
    io.err(`Code #${raw} does not exist or was already used`);
    return EXIT_FAILURE;
  }
  io.out(`Code #${raw} withdrawn.`);
  return EXIT_OK;
}

async function runWithoutArguments(
  parsed: ParsedArgs,
  run: (io: CommandIo) => Promise<void>,
  io: CommandIo,
) {
  assertOnlyOptions(parsed, []);
  assertArguments(parsed, []);
  await run(io);
  return EXIT_OK;
}

type CommandHandler = (parsed: ParsedArgs, io: CommandIo) => Promise<number>;

const COMMANDS: Record<string, CommandHandler> = {
  status: (parsed, io) => runWithoutArguments(parsed, status, io),
  invite: async (parsed, io) => {
    await invite(parsed, io);
    return EXIT_OK;
  },
  'reset-password': resetPassword,
  'revoke-sessions': revokeSessions,
  list: (parsed, io) => runWithoutArguments(parsed, listUsers, io),
  codes: (parsed, io) => runWithoutArguments(parsed, listCodes, io),
  'revoke-code': revokeCode,
};

/** Runs `quro user <command>`; `args` starts at the command name. Usage errors throw. */
export function runUserCommand(args: readonly string[], io: CommandIo): Promise<number> {
  if (args[0] === '--help' || args[0] === 'help') {
    io.out(USER_USAGE);
    return Promise.resolve(EXIT_OK);
  }
  const parsed = parseArgs(args);
  const command = parsed.positionals[0];
  if (command === undefined) throw new UsageError('A user command is required');
  const handler = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!handler) throw new UsageError(`Unknown user command: ${command}`);
  return handler(parsed, io);
}

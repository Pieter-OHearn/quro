// Drives the server of the upgraded 0.7.0 fixture over HTTP for upgrade.sh (docs/upgrade-fixture.md):
//
//   check            A browser signed in on 0.7.0 is still signed in (its session cookie works,
//                    an expired one does not); every fixture user signs in with the demo password
//                    and downloads every document their payslips and pension transactions refer
//                    to, which must be byte for byte the fixture's file.
//   remove-document  The owner removes the attachment of one row in the app (DELETE .../document),
//                    the way the upgrade guide resolves a document missing from the store.
//
//   bun exercise.ts check <base-url> --fixture DIR
//   bun exercise.ts remove-document <base-url> payslips|pension_transactions <id>
//
// The database (AFTER_DATABASE_URL, owner role) only says which rows and keys to check. All data
// is synthetic; output names row ids and keys, never contents.
import { parseArgs } from 'node:util';
import { sha256Hex } from './documents';
import { readManifest } from './verify';

// The 0.7.0 demo seed's password, which every fixture user has (edge-cases.sql).
const FIXTURE_PASSWORD = 'password123';
// Placeholders from edge-cases.sql, stored raw by 0.7.0 and as digests after the upgrade.
const SESSION_FROM_0_7_0 = { token: 'fixture-session-token-demo-0001', email: 'demo@quro.local' };
const EXPIRED_SESSION_FROM_0_7_0 = 'fixture-session-token-demo-0002-expired';
const FIRST_ARGUMENT = 2;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;

const DOWNLOADS = {
  payslips: (id: number) => `/api/salary/payslips/${id}/document/download`,
  pension_transactions: (id: number) => `/api/pensions/transactions/${id}/document/download`,
} as const;
const REMOVALS = {
  payslips: (id: number) => `/api/salary/payslips/${id}/document`,
  pension_transactions: (id: number) => `/api/pensions/transactions/${id}/document`,
} as const;
type AttachmentTable = keyof typeof DOWNLOADS;

type Reference = { table: AttachmentTable; id: number; email: string; key: string };
type Session = { cookie: string; csrf: string };

function fail(message: string): never {
  console.error(`upgrade exercise: ${message}`);
  process.exit(1);
}

function database(): InstanceType<typeof Bun.SQL> {
  const url = process.env.AFTER_DATABASE_URL;
  if (!url) fail('AFTER_DATABASE_URL is required');
  return new Bun.SQL(url);
}

async function references(sql: InstanceType<typeof Bun.SQL>): Promise<Reference[]> {
  const rows = (await sql.unsafe(`
    select 'payslips' as "table", p.id, u.email, p.document_storage_key as key
      from payslips p join users u on u.id = p.user_id
     where p.document_storage_key is not null
    union all
    select 'pension_transactions', t.id, u.email, t.document_storage_key
      from pension_transactions t join users u on u.id = t.user_id
     where t.document_storage_key is not null
    order by 1, 2`)) as Reference[];
  return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

async function signIn(base: string, email: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: FIXTURE_PASSWORD }),
  });
  if (response.status !== HTTP_OK) fail(`sign-in for ${email}: HTTP ${response.status}`);
  const cookies = response.headers.getSetCookie();
  const value = (name: string) =>
    cookies
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.split(';', 1)[0]
      ?.slice(name.length + 1);
  const session = value('session');
  const csrf = value('csrf_token');
  if (!session || !csrf) fail(`sign-in for ${email} set no session`);
  return { cookie: `session=${session}; csrf_token=${csrf}`, csrf };
}

async function currentUser(base: string, cookie: string): Promise<string | null> {
  const response = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
  if (response.status !== HTTP_OK) fail(`/api/auth/me: HTTP ${response.status}`);
  const body = (await response.json()) as { data: { email: string } | null };
  return body.data?.email ?? null;
}

async function checkSessionsFrom070(base: string) {
  const cookie = `session=${SESSION_FROM_0_7_0.token}`;
  if ((await currentUser(base, cookie)) !== SESSION_FROM_0_7_0.email) {
    fail('a session cookie issued by 0.7.0 no longer signs the browser in');
  }
  const accounts = await fetch(`${base}/api/savings/accounts`, { headers: { Cookie: cookie } });
  if (accounts.status !== HTTP_OK) fail(`a 0.7.0 session reads accounts: HTTP ${accounts.status}`);
  const expired = `session=${EXPIRED_SESSION_FROM_0_7_0}`;
  if ((await currentUser(base, expired)) !== null) fail('an expired 0.7.0 session signs in');
  const denied = await fetch(`${base}/api/savings/accounts`, { headers: { Cookie: expired } });
  if (denied.status !== HTTP_UNAUTHORIZED) fail(`an expired session: HTTP ${denied.status}`);
  console.log('a browser signed in on 0.7.0 stays signed in; an expired session does not');
}

async function check(base: string, fixture: string) {
  const manifest = await readManifest(fixture);
  await checkSessionsFrom070(base);
  const sql = database();
  try {
    const rows = await references(sql);
    if (rows.length === 0) fail('the database refers to no documents');
    const sessions = new Map<string, Session>();
    for (const row of rows) {
      let session = sessions.get(row.email);
      if (!session) {
        session = await signIn(base, row.email);
        sessions.set(row.email, session);
      }
      const response = await fetch(`${base}${DOWNLOADS[row.table](row.id)}`, {
        headers: { Cookie: session.cookie },
      });
      if (response.status !== HTTP_OK) fail(`${row.table}#${row.id}: HTTP ${response.status}`);
      const sha256 = sha256Hex(new Uint8Array(await response.arrayBuffer()));
      if (sha256 !== manifest.get(row.key)) fail(`${row.table}#${row.id}: not the fixture's file`);
    }
    console.log(
      `${sessions.size} user(s) signed in and downloaded ${rows.length} document(s), all identical to the fixture`,
    );
  } finally {
    await sql.close();
  }
}

async function removeDocument(base: string, table: AttachmentTable, id: number) {
  const sql = database();
  try {
    const row = (await references(sql)).find((item) => item.table === table && item.id === id);
    if (!row) fail(`${table}#${id} refers to no document`);
    const session = await signIn(base, row.email);
    const response = await fetch(`${base}${REMOVALS[table](id)}`, {
      method: 'DELETE',
      headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrf },
    });
    if (response.status !== HTTP_OK)
      fail(`removing ${table}#${id}'s document: HTTP ${response.status}`);
    if ((await references(sql)).some((item) => item.table === table && item.id === id)) {
      fail(`${table}#${id} still refers to its document`);
    }
    console.log(`${table}#${id}: the attachment was removed in the app`);
  } finally {
    await sql.close();
  }
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    args: Bun.argv.slice(FIRST_ARGUMENT),
    allowPositionals: true,
    options: { fixture: { type: 'string' } },
  });
  const [command, base, table, id] = positionals;
  if (command === 'check' && base && values.fixture) await check(base, values.fixture);
  else if (
    command === 'remove-document' &&
    base &&
    (table === 'payslips' || table === 'pension_transactions') &&
    id
  ) {
    await removeDocument(base, table, Number(id));
  } else {
    fail(
      'usage: exercise.ts check <base-url> --fixture DIR | remove-document <base-url> payslips|pension_transactions <id>',
    );
  }
}

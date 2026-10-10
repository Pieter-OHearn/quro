// Drives a running Quro install over HTTP for the clean-install test (run.sh): the first account,
// a ledger write, a document upload and download, and later the same data after a restart.
//
//   bun scripts/clean-install/exercise.ts setup  <base-url> <state-file> <invite-code>
//   bun scripts/clean-install/exercise.ts verify <base-url> <state-file>
//
// Every value is synthetic. The account password is generated here and kept only in the state
// file, which lives in the test's temporary directory; nothing secret is printed.

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

type State = {
  email: string;
  password: string;
  accountId: number;
  payslipId: number;
  documentSha256: string;
  expectedBalance: number;
};

type Session = { cookie: string; csrf: string };

const OPENING_BALANCE = 1000;
const DEPOSIT = 250;
const PDF = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% synthetic clean-install document\ntrailer\n<<>>\n%%EOF\n',
);

function fail(message: string): never {
  console.error(`clean-install: ${message}`);
  process.exit(1);
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function sessionFrom(response: Response): Session {
  const cookies = response.headers.getSetCookie();
  const value = (name: string) =>
    cookies
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.split(';', 1)[0]
      ?.slice(name.length + 1);
  const session = value('session');
  const csrf = value('csrf_token');
  if (!session || !csrf) fail(`no session cookie after ${response.url}`);
  return { cookie: `session=${session}; csrf_token=${csrf}`, csrf };
}

async function call(
  base: string,
  path: string,
  init: { method?: string; json?: unknown; body?: BodyInit; session?: Session } = {},
): Promise<Response> {
  const headers = new Headers();
  if (init.session) {
    headers.set('Cookie', init.session.cookie);
    headers.set('X-CSRF-Token', init.session.csrf);
  }
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  return fetch(`${base}${path}`, { method: init.method ?? 'GET', headers, body });
}

async function expectStatus(response: Response, status: number, what: string) {
  if (response.status === status) return response;
  const text = await response.text().catch(() => '');
  return fail(`${what}: HTTP ${response.status}, expected ${status}: ${text.slice(0, 200)}`);
}

async function dataOf<T>(response: Response, status: number, what: string): Promise<T> {
  await expectStatus(response, status, what);
  return ((await response.json()) as { data: T }).data;
}

async function signUp(
  base: string,
  inviteCode: string,
): Promise<{ session: Session; state: Pick<State, 'email' | 'password'> }> {
  const email = `owner-${randomBytes(4).toString('hex')}@install.test`;
  const password = randomBytes(12).toString('hex');
  const response = await call(base, '/api/auth/signup', {
    method: 'POST',
    json: {
      firstName: 'Install',
      lastName: 'Check',
      email,
      password,
      age: 40,
      retirementAge: 67,
      inviteCode,
    },
  });
  await expectStatus(response, 201, 'sign up the first account');
  return { session: sessionFrom(response), state: { email, password } };
}

async function signIn(base: string, state: State): Promise<Session> {
  const response = await call(base, '/api/auth/signin', {
    method: 'POST',
    json: { email: state.email, password: state.password },
  });
  await expectStatus(response, 200, 'sign in with the local account');
  return sessionFrom(response);
}

async function writeLedger(base: string, session: Session) {
  const account = await dataOf<{ id: number }>(
    await call(base, '/api/savings/accounts', {
      method: 'POST',
      session,
      json: {
        name: 'Install check',
        bank: 'Test bank',
        balance: OPENING_BALANCE,
        currency: 'EUR',
        interestRate: 1,
        accountType: 'Easy Access',
        color: '#2563eb',
        emoji: 'S',
      },
    }),
    201,
    'create a savings account',
  );
  await dataOf(
    await call(base, '/api/savings/transactions', {
      method: 'POST',
      session,
      json: {
        accountId: account.id,
        type: 'deposit',
        amount: DEPOSIT,
        date: '2026-01-15',
        note: 'Install check',
      },
    }),
    201,
    'record a deposit',
  );
  return account.id;
}

async function uploadDocument(base: string, session: Session) {
  const payslip = await dataOf<{ id: number }>(
    await call(base, '/api/salary/payslips', {
      method: 'POST',
      session,
      json: {
        month: 'January 2026',
        date: '2026-01-31',
        gross: 4000,
        tax: 1000,
        pension: 200,
        net: 2800,
        currency: 'EUR',
      },
    }),
    201,
    'create a payslip',
  );
  const form = new FormData();
  form.append('file', new File([PDF], 'install-check.pdf', { type: 'application/pdf' }));
  await expectStatus(
    await call(base, `/api/salary/payslips/${payslip.id}/document`, {
      method: 'POST',
      session,
      body: form,
    }),
    201,
    'upload a document',
  );
  return payslip.id;
}

async function checkData(base: string, session: Session, state: State) {
  const account = await dataOf<{ balance: number | string }>(
    await call(base, `/api/savings/accounts/${state.accountId}`, { session }),
    200,
    'read the savings account',
  );
  if (Number(account.balance) !== state.expectedBalance) {
    fail(`balance is ${account.balance}, expected ${state.expectedBalance}`);
  }
  const download = await expectStatus(
    await call(base, `/api/salary/payslips/${state.payslipId}/document/download`, { session }),
    200,
    'download the document',
  );
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (sha256(bytes) !== state.documentSha256)
    fail('the downloaded document differs from the upload');
}

async function setup(base: string, stateFile: string, inviteCode: string) {
  const { session, state: credentials } = await signUp(base, inviteCode);
  const accountId = await writeLedger(base, session);
  const payslipId = await uploadDocument(base, session);
  const state: State = {
    ...credentials,
    accountId,
    payslipId,
    documentSha256: sha256(PDF),
    expectedBalance: OPENING_BALANCE + DEPOSIT,
  };
  await checkData(base, session, state);
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
  console.log('clean-install: signed up, wrote the ledger, uploaded and downloaded a document');
}

async function verify(base: string, stateFile: string) {
  const state = JSON.parse(readFileSync(stateFile, 'utf8')) as State;
  const session = await signIn(base, state);
  await checkData(base, session, state);
  console.log('clean-install: signed in; ledger and document are intact');
}

const [command, base, stateFile, inviteCode] = process.argv.slice(2);
if (command === 'setup' && base && stateFile && inviteCode)
  await setup(base, stateFile, inviteCode);
else if (command === 'verify' && base && stateFile) await verify(base, stateFile);
else
  fail(
    'usage: exercise.ts setup <base-url> <state-file> <invite-code> | verify <base-url> <state-file>',
  );

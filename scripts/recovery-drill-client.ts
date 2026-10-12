// HTTP client for scripts/recovery-drill.sh. It runs inside a backend image container on the
// drill's private network and talks to a Quro backend as the synthetic demo user, so the drill
// exercises sign-in, uploads and downloads the way a browser does. Synthetic data only.
//
//   bun recovery-drill-client.ts wait <base-url>
//   bun recovery-drill-client.ts upload <base-url> <count> <kib>
//   bun recovery-drill-client.ts snapshot <base-url>
//   bun recovery-drill-client.ts write-loop <base-url> <seconds>
//
// Requires Bun; imports nothing from the repository.

import { createHash } from 'node:crypto';

const DEMO = { email: 'demo@quro.local', password: 'password123' };
const KIB = 1024;
const HEALTH_ATTEMPTS = 300;
const HEALTH_INTERVAL_MS = 200;
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const MONTHS = 12;
const MONTH_DIGITS = 2;
const LOOP_DOCUMENT_KIB = 16;
const FIRST_LOOP_INDEX = 10_000;
const DEFAULTS = { count: 10, kib: 64, seconds: 5 };
const SYNTHETIC_PAYSLIP = { gross: 4000, tax: 900, pension: 200, net: 2900 };

type Session = { base: string; cookie: string; csrf: string };

function fail(message: string): never {
  console.error(`recovery-drill-client: ${message}`);
  process.exit(1);
}

async function waitForHealth(base: string): Promise<void> {
  for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt += 1) {
    const ok = await fetch(`${base}/api/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (ok) return;
    await Bun.sleep(HEALTH_INTERVAL_MS);
  }
  fail(`${base} did not become healthy`);
}

async function signIn(base: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DEMO),
  });
  if (response.status !== HTTP_OK) fail(`sign-in returned ${response.status}`);
  const cookies = response.headers.getSetCookie();
  const session = cookies.map((c) => /^session=([^;]*)/.exec(c)?.[1]).find(Boolean);
  const csrf = cookies.map((c) => /^csrf_token=([^;]*)/.exec(c)?.[1]).find(Boolean);
  if (!session || !csrf) fail('sign-in set no session');
  return { base, cookie: `session=${session}; csrf_token=${csrf}`, csrf };
}

function call(session: Session, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Cookie', session.cookie);
  if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', session.csrf);
  return fetch(`${session.base}${path}`, { ...init, headers });
}

async function json<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) fail(`${what} returned ${response.status}`);
  return (await response.json()) as T;
}

/** A synthetic PDF of about `kib` KiB: valid magic, a label and filler. */
function syntheticPdf(label: string, kib: number): Uint8Array<ArrayBuffer> {
  const head = `%PDF-1.4\n%synthetic recovery drill document ${label}\n`;
  const filler = createHash('sha256').update(label).digest('hex');
  const body = head + filler.repeat(Math.ceil((kib * KIB) / filler.length));
  return new TextEncoder().encode(body.slice(0, Math.max(head.length, kib * KIB)));
}

async function createPayslip(session: Session, index: number): Promise<Response> {
  const month = (index % MONTHS) + 1;
  return call(session, '/api/salary/payslips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employmentId: null,
      month: `Drill ${index}`,
      date: `2025-${String(month).padStart(MONTH_DIGITS, '0')}-25`,
      gross: SYNTHETIC_PAYSLIP.gross + index,
      tax: SYNTHETIC_PAYSLIP.tax,
      pension: SYNTHETIC_PAYSLIP.pension,
      net: SYNTHETIC_PAYSLIP.net + index,
      bonus: null,
      currency: 'EUR',
    }),
  });
}

async function uploadDocument(session: Session, payslipId: number, bytes: Uint8Array<ArrayBuffer>) {
  const form = new FormData();
  form.append('file', new File([bytes], `payslip-${payslipId}.pdf`, { type: 'application/pdf' }));
  return call(session, `/api/salary/payslips/${payslipId}/document`, {
    method: 'POST',
    body: form,
  });
}

async function upload(base: string, count: number, kib: number): Promise<void> {
  const session = await signIn(base);
  let bytes = 0;
  for (let index = 0; index < count; index += 1) {
    const created = await json<{ data: { id: number } }>(
      await createPayslip(session, index),
      'creating a payslip',
    );
    const pdf = syntheticPdf(`payslip ${index}`, kib);
    const uploaded = await uploadDocument(session, created.data.id, pdf);
    if (uploaded.status !== HTTP_CREATED) fail(`upload returned ${uploaded.status}`);
    bytes += pdf.length;
  }
  console.log(JSON.stringify({ uploaded: count, bytes }));
}

type Payslip = { id: number; month: string; gross: number; net: number; document: unknown };

async function allPages<T>(session: Session, path: string): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
    const page: { data: T[]; nextCursor?: string | null } = await json(
      await call(session, `${path}${query}`),
      path,
    );
    rows.push(...page.data);
    cursor = page.nextCursor ?? null;
  } while (cursor);
  return rows;
}

/** What the demo user sees: accounts (own and joint), payslips and document checksums. */
async function snapshot(base: string): Promise<void> {
  const session = await signIn(base);
  const me = await json<{ data: { email: string } }>(await call(session, '/api/auth/me'), 'me');
  const accounts = await json<{ data: { name: string; balance: number; currency: string }[] }>(
    await call(session, '/api/savings/accounts'),
    'savings accounts',
  );
  const payslips = await allPages<Payslip>(session, '/api/salary/payslips');
  const documents: Record<string, string> = {};
  for (const payslip of payslips) {
    if (!payslip.document) continue;
    const response = await call(session, `/api/salary/payslips/${payslip.id}/document/download`);
    if (!response.ok) fail(`download of payslip ${payslip.id} returned ${response.status}`);
    documents[payslip.id] = createHash('sha256')
      .update(new Uint8Array(await response.arrayBuffer()))
      .digest('hex');
  }
  const view = {
    user: me.data.email,
    accounts: accounts.data
      .map(({ name, balance, currency }) => ({ name, balance, currency }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    payslips: payslips
      .map(({ id, month, gross, net }) => ({ id, month, gross, net }))
      .sort((a, b) => a.id - b.id),
    documents,
  };
  console.log(JSON.stringify(view, null, 1));
}

/** Creates payslips with a document until the time is up; prints how each request ended. */
async function writeLoop(base: string, seconds: number): Promise<void> {
  const session = await signIn(base);
  const statuses: Record<string, number> = {};
  const count = (status: number) => {
    statuses[status] = (statuses[status] ?? 0) + 1;
  };
  const deadline = Date.now() + seconds * 1000;
  for (let index = FIRST_LOOP_INDEX; Date.now() < deadline; index += 1) {
    const created = await createPayslip(session, index);
    count(created.status);
    if (created.status !== HTTP_CREATED) continue;
    const { data } = (await created.json()) as { data: { id: number } };
    count(
      (await uploadDocument(session, data.id, syntheticPdf(`loop ${index}`, LOOP_DOCUMENT_KIB)))
        .status,
    );
  }
  console.log(JSON.stringify({ statuses }));
}

const [command, base, ...rest] = process.argv.slice(2);
if (!command || !base) fail('usage: <wait|upload|snapshot|write-loop> <base-url> [...]');
switch (command) {
  case 'wait':
    await waitForHealth(base);
    break;
  case 'upload':
    await upload(base, Number(rest[0] ?? DEFAULTS.count), Number(rest[1] ?? DEFAULTS.kib));
    break;
  case 'snapshot':
    await snapshot(base);
    break;
  case 'write-loop':
    await writeLoop(base, Number(rest[0] ?? DEFAULTS.seconds));
    break;
  default:
    fail(`unknown command ${command}`);
}

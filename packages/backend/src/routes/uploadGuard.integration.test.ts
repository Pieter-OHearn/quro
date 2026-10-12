import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { installProviderMocks } from '../test/providerMocks';

const providers = await installProviderMocks();

const { createIntegrationHelpers } = await import('../test/integration');
const { purgeSyntheticUsers, seedRows } = await import('../test/accessWorld');

import type { AuthSession } from '../test/integration';
import type { RowIds } from '../test/accessWorld';

/**
 * Every route that takes a PDF upload reads its form through one helper. A body that is not a
 * readable multipart form answers 400 `Invalid upload`, a declared body above the PDF limit
 * answers 413, and neither the answer nor the log carries a stack trace or the form parser's
 * message.
 */

const DOMAIN = 'upload-guard.integration.quro.test';
const integration = createIntegrationHelpers(DOMAIN);
const BOUNDARY = 'quro-test-boundary';

let owner: AuthSession;
let rows: RowIds;

type UploadRoute = { name: string; path: () => string; fields?: Record<string, string> };

const ROUTES: UploadRoute[] = [
  {
    name: 'pension transaction document',
    path: () => `/api/pensions/transactions/${rows.pensionTxn}/document`,
  },
  { name: 'payslip document', path: () => `/api/salary/payslips/${rows.payslip}/document` },
  {
    name: 'pension statement import',
    path: () => '/api/pensions/imports',
    fields: { potId: String(0) },
  },
];

beforeAll(async () => {
  await purgeSyntheticUsers(integration, DOMAIN);
  owner = await integration.signUp('owner');
  rows = await seedRows({
    userId: owner.user.id,
    marker: 'upload-guard-owner',
    isJoint: false,
    includeSingletons: true,
    storeDocument: (key, bytes) => providers.storedDocuments.set(key, bytes),
    extraSessionId: 'b'.repeat(64),
  });
  ROUTES[2]!.fields = { potId: String(rows.pensionPot) };
});

afterAll(async () => {
  await providers.restore();
  await purgeSyntheticUsers(integration, DOMAIN);
});

type Logged = unknown[][];
let logged: Logged = [];
const spies = [
  spyOn(console, 'error').mockImplementation((...args: unknown[]) => void logged.push(args)),
  spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void logged.push(args)),
  spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logged.push(args)),
];

afterEach(() => {
  logged = [];
});

afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});

function post(path: string, body: BodyInit, headers: Record<string, string>) {
  return integration.request(path, { method: 'POST', cookie: owner.cookie, body, headers });
}

function multipartHeaders() {
  return { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` };
}

function expectQuietLog() {
  for (const args of logged) {
    for (const arg of args) {
      // No error object (with its stack) and no parser message reaches the log.
      expect(arg instanceof Error).toBe(false);
      expect(String(arg)).not.toMatch(/\n\s+at |boundary|multipart\/form-data;/i);
    }
  }
}

async function expectInvalidUpload(response: Response) {
  expect(response.status).toBe(400);
  const text = await response.text();
  expect(JSON.parse(text)).toEqual({ error: 'Invalid upload' });
  expect(text).not.toMatch(/\n\s+at |stack|boundary/i);
  expectQuietLog();
}

function syntheticPdf(name = 'synthetic.pdf', content = '%PDF-1.7\n%synthetic\n%%EOF\n') {
  return new File([content], name, { type: 'application/pdf' });
}

describe.each(ROUTES)('$name upload', (route) => {
  test('a truncated multipart body answers 400 Invalid upload', async () => {
    const body =
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n` +
      'Content-Type: application/pdf\r\n\r\n%PDF-1.7 synthetic'; // no closing boundary
    await expectInvalidUpload(await post(route.path(), body, multipartHeaders()));
  });

  test('a body without the declared boundary answers 400 Invalid upload', async () => {
    await expectInvalidUpload(
      await post(route.path(), 'not a multipart body at all', multipartHeaders()),
    );
  });

  test('a body that is not a form answers 400 Invalid upload', async () => {
    await expectInvalidUpload(
      await post(route.path(), '%PDF-1.7 synthetic', { 'Content-Type': 'application/pdf' }),
    );
  });

  test('a declared body above the PDF limit answers 413 before it is read', async () => {
    const form = new FormData();
    form.set('file', syntheticPdf());
    const response = await post(route.path(), form, { 'Content-Length': String(64 * 1024 ** 2) });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'PDF exceeds 20MB limit' });
  });

  test('a file named .pdf that is not a PDF is refused as a client error', async () => {
    const form = new FormData();
    for (const [name, value] of Object.entries(route.fields ?? {})) form.set(name, value);
    form.set('file', syntheticPdf('statement.pdf', 'plain text, not a PDF'));
    const response = await post(route.path(), form, {});
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Uploaded file is not a valid PDF' });
    expectQuietLog();
  });

  test('a well-formed upload still succeeds', async () => {
    const form = new FormData();
    for (const [name, value] of Object.entries(route.fields ?? {})) form.set(name, value);
    form.set('file', syntheticPdf(`ok-${crypto.randomUUID()}.pdf`, `%PDF-1.7\n%${route.name}\n`));
    const response = await post(route.path(), form, {});
    expect(response.status).toBe(201);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { BACKEND_ORIGIN, issueInviteCode } from './environment';

function storedFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

test('uploads and downloads a payslip PDF through the filesystem document store', async ({
  page,
}) => {
  const documentsDirectory = process.env.QRO_SMOKE_DOCUMENTS_DIR;
  if (!documentsDirectory) throw new Error('QRO_SMOKE_DOCUMENTS_DIR is not set');
  const runId = Date.now();
  const api = page.request;

  const signup = await api.post(`${BACKEND_ORIGIN}/api/auth/signup`, {
    data: {
      firstName: 'Playwright',
      lastName: 'Documents',
      email: `smoke-documents-${runId}@playwright.quro.test`,
      password: `Smoke-${runId}-Docs123!`,
      age: 35,
      retirementAge: 67,
      inviteCode: issueInviteCode(),
    },
  });
  expect(signup.status()).toBe(201);
  const cookies = await page.context().cookies(BACKEND_ORIGIN);
  const csrfToken = cookies.find((cookie) => cookie.name === 'csrf_token')?.value;
  expect(csrfToken).toBeTruthy();
  const headers = { 'X-CSRF-Token': csrfToken ?? '' };

  const payslip = await api.post(`${BACKEND_ORIGIN}/api/salary/payslips`, {
    headers,
    data: {
      month: `Smoke documents ${runId}`,
      date: new Date().toISOString().slice(0, 10),
      gross: 4000,
      tax: 1000,
      pension: 200,
      net: 2800,
      bonus: 0,
      currency: 'EUR',
    },
  });
  expect(payslip.status()).toBe(201);
  const payslipId = ((await payslip.json()) as { data: { id: number } }).data.id;

  // A synthetic, minimal PDF with a marker unique to this run.
  const pdf = Buffer.from(`%PDF-1.4\n% quro smoke document ${runId}\n%%EOF\n`, 'utf8');
  const before = new Set(storedFiles(documentsDirectory));
  const upload = await api.post(`${BACKEND_ORIGIN}/api/salary/payslips/${payslipId}/document`, {
    headers,
    multipart: {
      file: { name: `smoke-${runId}.pdf`, mimeType: 'application/pdf', buffer: pdf },
    },
  });
  expect(upload.status()).toBe(201);

  const added = storedFiles(documentsDirectory).filter((path) => !before.has(path));
  expect(added).toHaveLength(1);
  expect(readFileSync(added[0]).equals(pdf)).toBe(true);

  const download = await api.get(
    `${BACKEND_ORIGIN}/api/salary/payslips/${payslipId}/document/download`,
  );
  expect(download.status()).toBe(200);
  expect(download.headers()['content-type']).toContain('application/pdf');
  expect((await download.body()).equals(pdf)).toBe(true);
});

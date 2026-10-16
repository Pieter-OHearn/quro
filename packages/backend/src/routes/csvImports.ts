import { Hono, type Context } from 'hono';
import {
  CSV_DELIMITERS,
  CSV_IMPORT_KINDS,
  CSV_IMPORT_LIMITS,
  type CsvDelimiter,
  type CsvImportKind,
} from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import { parseImportMapping } from '../lib/csvImport/normalize';
import {
  cancelImport,
  describeCsv,
  commitNextBatch,
  deleteProfile,
  getImportProgress,
  ImportInputError,
  ImportRefused,
  listImportRows,
  listImports,
  listProfiles,
  previewImport,
  reconcileImport,
  stageImport,
  type EnteredClosing,
  type ImportInput,
  type ImportScope,
  type StageInput,
} from '../lib/csvImport/service';
import {
  err,
  ok,
  parseDateField,
  parseId,
  parseIntegerField,
  parseMoneyField,
  readJsonRecord,
  rejectUnknownFields,
  type ParseResult,
} from '../lib/requestValidation';

// Reviewed CSV import: a dry-run preview, staging of the approved rows, bounded commit batches,
// and a reconciliation against the statement's closing balance. Every id in a request is checked
// against the authenticated user; a request never names an owner.

const app = new Hono();

const INVALID = 'Invalid import request';
const MAX_FILE_NAME_LENGTH = 200;
const COMMON_FIELDS = ['kind', 'accountId', 'csv', 'mapping', 'closingBalance', 'closingDate'];
const STAGE_FIELDS = [...COMMON_FIELDS, 'fileName', 'fileSha256', 'selectedRows', 'saveProfile'];
// A little more than the file limit: JSON escaping and the rest of the request.
const MAX_BODY_BYTES = CSV_IMPORT_LIMITS.maxBytes * 2 + 100_000;

const scopeOf = (c: Context): ImportScope => ({
  userId: getAuthUser(c).id,
  partnerId: getPartnerId(c),
});

function parseKind(value: unknown): ParseResult<CsvImportKind> {
  return CSV_IMPORT_KINDS.includes(value as CsvImportKind)
    ? ok(value as CsvImportKind)
    : err('Choose savings or budget');
}

function parseClosing(body: Record<string, unknown>): ParseResult<EnteredClosing> {
  const hasBalance = body.closingBalance !== undefined && body.closingBalance !== null;
  const hasDate = body.closingDate !== undefined && body.closingDate !== null;
  if (!hasBalance && !hasDate) return ok(null);
  if (hasBalance !== hasDate) return err('Send the closing balance and its date together');
  const amount = parseMoneyField(body.closingBalance, {
    field: 'closingBalance',
    error: 'The closing balance must be a number',
  });
  if (!amount.ok) return amount;
  const date = parseDateField(body.closingDate, 'The closing date must be a valid ISO date');
  return date.ok ? ok({ amount: amount.value, date: date.value }) : date;
}

function parseAccountId(kind: CsvImportKind, body: Record<string, unknown>) {
  if (kind === 'savings') return parseIntegerField(body.accountId, 'Invalid account id', 1);
  const absent = body.accountId === undefined || body.accountId === null;
  return absent ? ok(null) : err('A budget import has no account');
}

function parseCsvText(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || value === '') return err('Send the file as text');
  return value.length > CSV_IMPORT_LIMITS.maxBytes
    ? err(`The file is larger than ${CSV_IMPORT_LIMITS.maxBytes / 1_000_000} MB`)
    : ok(value);
}

function parseImportInput(body: Record<string, unknown>): ParseResult<ImportInput> {
  const kind = parseKind(body.kind);
  if (!kind.ok) return kind;
  const accountId = parseAccountId(kind.value, body);
  if (!accountId.ok) return accountId;
  const csv = parseCsvText(body.csv);
  if (!csv.ok) return csv;
  const mapping = parseImportMapping(body.mapping, kind.value);
  if (!mapping.ok) return mapping;
  const closing = parseClosing(body);
  if (!closing.ok) return closing;
  if (closing.value && kind.value !== 'savings') return err('A budget import has no balance');
  return ok({
    kind: kind.value,
    accountId: accountId.value,
    csv: csv.value,
    mapping: mapping.value,
    closing: closing.value,
  });
}

function parseStageInput(body: Record<string, unknown>): ParseResult<StageInput> {
  const input = parseImportInput(body);
  if (!input.ok) return input;
  const { fileSha256, selectedRows, fileName, saveProfile } = body;
  if (typeof fileSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(fileSha256)) {
    return err('Send the file digest from the preview');
  }
  const validRows =
    Array.isArray(selectedRows) &&
    selectedRows.length <= CSV_IMPORT_LIMITS.maxRows &&
    selectedRows.every((row) => Number.isInteger(row) && row >= 1);
  if (!validRows) return err('Send the numbers of the rows to import');
  if (saveProfile !== undefined && typeof saveProfile !== 'boolean') {
    return err('saveProfile must be true or false');
  }
  return ok({
    ...input.value,
    fileName: typeof fileName === 'string' ? fileName.slice(0, MAX_FILE_NAME_LENGTH) : null,
    fileSha256,
    selectedRows: selectedRows as number[],
    saveProfile: saveProfile === true,
  });
}

async function readBody(c: Context, allowed: readonly string[]) {
  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { response: c.json({ error: 'The file is too large' }, HTTP_STATUS.PAYLOAD_TOO_LARGE) };
  }
  const body = await readJsonRecord(c.req, INVALID);
  if (!body.ok) return { response: c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST) };
  const unknown = rejectUnknownFields(body.value, allowed);
  if (!unknown.ok) return { response: c.json({ error: unknown.error }, HTTP_STATUS.BAD_REQUEST) };
  return { body: body.value };
}

function failure(c: Context, error: unknown) {
  if (error instanceof ImportRefused) return c.json({ error: error.message }, error.status);
  if (error instanceof ImportInputError) {
    return c.json({ error: error.message }, HTTP_STATUS.BAD_REQUEST);
  }
  throw error;
}

app.post('/csv/headers', async (c) => {
  const read = await readBody(c, ['csv', 'delimiter']);
  if (!read.body) return read.response;
  const csv = parseCsvText(read.body.csv);
  if (!csv.ok) return c.json({ error: csv.error }, HTTP_STATUS.BAD_REQUEST);
  const delimiter = read.body.delimiter ?? 'auto';
  if (!CSV_DELIMITERS.includes(delimiter as CsvDelimiter)) {
    return c.json({ error: 'Invalid delimiter' }, HTTP_STATUS.BAD_REQUEST);
  }
  try {
    return c.json({ data: describeCsv(csv.value, delimiter as CsvDelimiter) });
  } catch (error) {
    return failure(c, error);
  }
});

app.post('/csv/preview', async (c) => {
  const read = await readBody(c, COMMON_FIELDS);
  if (!read.body) return read.response;
  const input = parseImportInput(read.body);
  if (!input.ok) return c.json({ error: input.error }, HTTP_STATUS.BAD_REQUEST);
  try {
    return c.json({ data: await previewImport(scopeOf(c), input.value) });
  } catch (error) {
    return failure(c, error);
  }
});

app.post('/csv', async (c) => {
  const read = await readBody(c, STAGE_FIELDS);
  if (!read.body) return read.response;
  const input = parseStageInput(read.body);
  if (!input.ok) return c.json({ error: input.error }, HTTP_STATUS.BAD_REQUEST);
  try {
    const scope = scopeOf(c);
    const id = await stageImport(scope, input.value);
    return c.json({ data: await getImportProgress(scope, id) }, HTTP_STATUS.CREATED);
  } catch (error) {
    return failure(c, error);
  }
});

app.get('/csv', async (c) => {
  const kind = c.req.query('kind');
  const accountIdRaw = c.req.query('accountId');
  const parsedKind = kind === undefined ? ok(undefined) : parseKind(kind);
  const accountId = accountIdRaw === undefined ? null : parseId(accountIdRaw);
  if (!parsedKind.ok || (accountIdRaw !== undefined && accountId === null)) {
    return c.json({ error: INVALID }, HTTP_STATUS.BAD_REQUEST);
  }
  return c.json({
    data: await listImports(scopeOf(c), {
      kind: parsedKind.value,
      accountId: accountId ?? undefined,
    }),
  });
});

function importId(c: Context): number | null {
  return parseId(c.req.param('id') ?? '');
}

app.get('/csv/:id', async (c) => {
  const id = importId(c);
  if (id === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);
  try {
    return c.json({ data: await getImportProgress(scopeOf(c), id) });
  } catch (error) {
    return failure(c, error);
  }
});

app.get('/csv/:id/rows', async (c) => {
  const id = importId(c);
  if (id === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);
  const offset = c.req.query('offset') === undefined ? 0 : Number(c.req.query('offset'));
  if (!Number.isInteger(offset) || offset < 0) {
    return c.json({ error: INVALID }, HTTP_STATUS.BAD_REQUEST);
  }
  try {
    const data = await listImportRows(scopeOf(c), id, { offset, limit: 500 });
    return c.json({ data });
  } catch (error) {
    return failure(c, error);
  }
});

app.post('/csv/:id/commit', async (c) => {
  const id = importId(c);
  if (id === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);
  try {
    return c.json({ data: await commitNextBatch(scopeOf(c), id) });
  } catch (error) {
    return failure(c, error);
  }
});

app.post('/csv/:id/cancel', async (c) => {
  const id = importId(c);
  if (id === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);
  try {
    return c.json({ data: await cancelImport(scopeOf(c), id) });
  } catch (error) {
    return failure(c, error);
  }
});

app.post('/csv/:id/reconcile', async (c) => {
  const id = importId(c);
  if (id === null) return c.json({ error: 'Invalid import id' }, HTTP_STATUS.BAD_REQUEST);
  const body = await readJsonRecord(c.req, INVALID);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  const unknown = rejectUnknownFields(body.value, ['difference']);
  if (!unknown.ok) return c.json({ error: unknown.error }, HTTP_STATUS.BAD_REQUEST);
  const difference = parseMoneyField(body.value.difference, {
    field: 'difference',
    error: 'Send the difference you were shown',
  });
  if (!difference.ok) return c.json({ error: difference.error }, HTTP_STATUS.BAD_REQUEST);
  try {
    return c.json({ data: await reconcileImport(scopeOf(c), id, difference.value) });
  } catch (error) {
    return failure(c, error);
  }
});

app.get('/profiles', async (c) => {
  const kind = c.req.query('kind');
  const parsed = kind === undefined ? ok(undefined) : parseKind(kind);
  if (!parsed.ok) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  return c.json({ data: await listProfiles(scopeOf(c), parsed.value) });
});

app.delete('/profiles/:id', async (c) => {
  const id = parseId(c.req.param('id') ?? '');
  if (id === null) return c.json({ error: 'Invalid profile id' }, HTTP_STATUS.BAD_REQUEST);
  const removed = await deleteProfile(scopeOf(c), id);
  if (!removed) return c.json({ error: 'Profile not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data: { id } });
});

export default app;

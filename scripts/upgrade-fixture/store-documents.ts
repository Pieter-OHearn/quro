// Runs inside the 0.7.0 backend image during generate.sh, through the image's own entry point
// (which turns its secrets into DATABASE_URL and the S3 settings).
//
//   attach:        stores each fixture PDF with 0.7.0's own S3 upload code under the key that
//                  edge-cases.sql recorded for it, after checking the recorded size and SHA-256.
//   export <dir>:  lists the bucket and writes every object to <dir>/documents/<key>, plus
//                  <dir>/documents.sha256 in `sha256sum` format.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FIXTURE_DOCUMENTS, buildPdf, sha256Hex, type FixtureDocument } from './documents';

// 0.7.0's module, resolved inside the image only; a variable keeps the type checker away from it.
const OLD_S3_MODULE = '/app/packages/backend/src/lib/s3.ts';
// Bun.argv starts with the runtime and the script.
const FIRST_ARGUMENT = 2;

type Reference = { source: string; key: string; size: number; sha256: string | null };

async function readReferences(): Promise<Reference[]> {
  const sql = new Bun.SQL(process.env.DATABASE_URL ?? '');
  try {
    return await sql<Reference[]>`
      select 'payslips#' || id as source, document_storage_key as key, document_size_bytes as size,
        null as sha256
      from payslips where document_storage_key is not null
      union all
      select 'pension_transactions#' || id, document_storage_key, document_size_bytes, null
      from pension_transactions where document_storage_key is not null
      union all
      select 'pension_statement_imports#' || id, storage_key, size_bytes, file_hash_sha256
      from pension_statement_imports
      order by 2, 1`;
  } finally {
    await sql.close();
  }
}

type Upload = { key: string; bytes: Uint8Array };

/** Checks the rows that refer to one document; returns what to upload, if anything. */
function checkDocument(
  document: FixtureDocument,
  references: Reference[],
  problems: string[],
): Upload | null {
  const bytes = buildPdf(document.lines);
  const sha256 = sha256Hex(bytes);
  const rows = references.filter((row) => row.key.endsWith(`/${document.uuid}.pdf`));
  if (rows.length === 0) problems.push(`no row refers to document ${document.uuid}`);
  for (const row of rows.filter((candidate) => !matches(candidate, bytes.length, sha256))) {
    problems.push(
      `${row.source} records ${row.size} bytes${row.sha256 ? ` and ${row.sha256}` : ''}; ` +
        `document ${document.uuid} is ${bytes.length} bytes, SHA-256 ${sha256}`,
    );
  }
  const keys = [...new Set(rows.map((row) => row.key))];
  if (keys.length > 1)
    problems.push(`document ${document.uuid} has several keys: ${keys.join(', ')}`);
  return document.stored && keys[0] ? { key: keys[0], bytes } : null;
}

const matches = (row: Reference, size: number, sha256: string): boolean =>
  row.size === size && (row.sha256 === null || row.sha256 === sha256);

async function attach(): Promise<void> {
  const { uploadS3Object } = (await import(OLD_S3_MODULE)) as {
    uploadS3Object: (params: { key: string; body: Buffer; contentType: string }) => Promise<void>;
  };
  const references = await readReferences();
  const problems: string[] = [];
  const uploads = FIXTURE_DOCUMENTS.map((document) =>
    checkDocument(document, references, problems),
  );
  const suffixes = FIXTURE_DOCUMENTS.map((document) => `/${document.uuid}.pdf`);
  for (const row of references.filter(
    (candidate) => !suffixes.some((suffix) => candidate.key.endsWith(suffix)),
  )) {
    problems.push(`${row.source} refers to ${row.key}, which is not a fixture document`);
  }
  if (problems.length > 0)
    throw new Error(`Fixture documents do not match:\n  ${problems.join('\n  ')}`);
  for (const upload of uploads) {
    if (!upload) continue;
    await uploadS3Object({
      key: upload.key,
      body: Buffer.from(upload.bytes),
      contentType: 'application/pdf',
    });
    console.log(`stored ${upload.key} (${upload.bytes.length} bytes)`);
  }
}

async function exportStore(outputDirectory: string): Promise<void> {
  const client = new Bun.S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  });
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.list({ continuationToken });
    keys.push(...(page.contents ?? []).map((object) => object.key));
    continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (continuationToken);

  const manifest: string[] = [];
  for (const key of keys.sort()) {
    const bytes = new Uint8Array(await client.file(key).arrayBuffer());
    const path = join(outputDirectory, 'documents', key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, bytes);
    manifest.push(`${sha256Hex(bytes)}  ${key}`);
  }
  await Bun.write(join(outputDirectory, 'documents.sha256'), `${manifest.join('\n')}\n`);
  console.log(`exported ${keys.length} objects`);
}

const [command, argument] = Bun.argv.slice(FIRST_ARGUMENT);
if (command === 'attach') await attach();
else if (command === 'export' && argument) await exportStore(argument);
else throw new Error('usage: store-documents.ts attach | export <dir>');

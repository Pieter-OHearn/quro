import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';

// Removes the documents directory playwright.config.ts created for this run, and nothing else.
export default function globalTeardown(): void {
  const directory = process.env.QRO_SMOKE_DOCUMENTS_DIR;
  if (!directory) return;
  const path = resolve(directory);
  if (dirname(path) !== resolve(tmpdir()) || !basename(path).startsWith('quro-smoke-documents-')) {
    return;
  }
  rmSync(path, { recursive: true, force: true });
}

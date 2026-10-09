import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  archiveDocumentsDirectory,
  DocumentsBackupError,
  documentsArchivePath,
} from './documentsBackup';

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'quro-documents-backup-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('documents backup', () => {
  test('names the archive after the dump', () => {
    expect(documentsArchivePath('/backups/db/quro-20261009-001322.dump')).toBe(
      '/backups/db/quro-20261009-001322.documents.tar',
    );
    expect(documentsArchivePath('/backups/custom-name')).toBe('/backups/custom-name.documents.tar');
  });

  test('archives every document under its key, readable by the owner only', async () => {
    const documents = join(workspace, 'documents');
    const key = 'users/1/salary/payslips/2/11111111-1111-4111-8111-111111111111.pdf';
    mkdirSync(join(documents, 'users/1/salary/payslips/2'), { recursive: true });
    writeFileSync(join(documents, key), '%PDF-1.4 synthetic');
    const archive = join(workspace, 'quro-20261009-001322.documents.tar');

    await archiveDocumentsDirectory(documents, archive);

    expect(statSync(archive).mode & 0o777).toBe(0o600);
    expect(existsSync(`${archive}.partial`)).toBe(false);
    const restored = join(workspace, 'restored');
    mkdirSync(restored);
    const extract = Bun.spawnSync(['tar', '-xf', archive, '-C', restored]);
    expect(extract.exitCode).toBe(0);
    expect(readFileSync(join(restored, key), 'utf8')).toBe('%PDF-1.4 synthetic');
  });

  test('an empty documents directory gives an empty archive', async () => {
    const documents = join(workspace, 'documents');
    mkdirSync(documents);
    const archive = join(workspace, 'empty.documents.tar');
    await archiveDocumentsDirectory(documents, archive);
    expect(Bun.spawnSync(['tar', '-tf', archive]).exitCode).toBe(0);
  });

  test('a missing documents directory fails and leaves no archive', async () => {
    const archive = join(workspace, 'missing.documents.tar');
    await expect(
      archiveDocumentsDirectory(join(workspace, 'not-mounted'), archive),
    ).rejects.toBeInstanceOf(DocumentsBackupError);
    expect(readdirSync(workspace)).toEqual([]);
  });

  test('a failing tar leaves no archive behind', async () => {
    const documents = join(workspace, 'documents');
    mkdirSync(documents);
    const archive = join(workspace, 'failed.documents.tar');
    await expect(archiveDocumentsDirectory(documents, archive, 'false')).rejects.toBeInstanceOf(
      DocumentsBackupError,
    );
    expect(readdirSync(workspace)).toEqual(['documents']);
  });
});

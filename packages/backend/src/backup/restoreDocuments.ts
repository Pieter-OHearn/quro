import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { resolveDocumentPath, syncDirectory } from '../lib/filesystemDocumentStore';
import { FileSink, listDocumentFiles, removeQuietly, sha256OfFile } from './files';
import type { DocumentFile } from './manifest';

// Restoring documents into the filesystem store. The archive's documents are first written into
// a hidden staging directory inside the documents directory (same filesystem, so the final moves
// are renames), then the current top-level entries move aside and the staged ones move in.

const DIRECTORY_MODE = 0o700;

export type DocumentStaging = {
  directory: string;
  /** Writes one document of the archive into the staging directory. */
  write: (key: string, chunks: AsyncIterable<Uint8Array>) => Promise<void>;
  discard: () => Promise<void>;
};

export async function createDocumentStaging(documentsDirectory: string): Promise<DocumentStaging> {
  const directory = join(documentsDirectory, `.restore-${randomUUID()}`);
  await mkdir(directory, { mode: DIRECTORY_MODE });
  return {
    directory,
    write: async (key, chunks) => {
      const path = resolveDocumentPath(directory, key);
      await mkdir(dirname(path), { recursive: true, mode: DIRECTORY_MODE });
      const sink = await FileSink.create(path);
      try {
        for await (const chunk of chunks) await sink.write(chunk);
        await sink.close();
      } catch (error) {
        await sink.abandon();
        throw error;
      }
    },
    discard: () => removeQuietly(directory),
  };
}

/** Whether the documents directory holds any document. */
export async function hasDocuments(documentsDirectory: string): Promise<boolean> {
  return (await listDocumentFiles(documentsDirectory)).keys.length > 0;
}

/**
 * Replaces the documents directory's content with the staged documents. The previous documents
 * are deleted at the end; the pre-restore archive holds them.
 */
export async function swapInStagedDocuments(
  documentsDirectory: string,
  staging: DocumentStaging,
): Promise<void> {
  const previous = join(documentsDirectory, `.restore-previous-${randomUUID()}`);
  await mkdir(previous, { mode: DIRECTORY_MODE });
  for (const name of await readdir(documentsDirectory)) {
    if (name.startsWith('.')) continue;
    await rename(join(documentsDirectory, name), join(previous, name));
  }
  for (const name of await readdir(staging.directory)) {
    await rename(join(staging.directory, name), join(documentsDirectory, name));
  }
  await syncDirectory(documentsDirectory);
  await staging.discard();
  await removeQuietly(previous);
}

/** Problems found when the restored documents are read back and compared with the manifest. */
export async function checkRestoredDocuments(
  documentsDirectory: string,
  expected: readonly DocumentFile[],
): Promise<string[]> {
  const { keys } = await listDocumentFiles(documentsDirectory);
  const problems: string[] = [];
  const present = new Set(keys);
  for (const file of expected) {
    if (!present.has(file.key)) problems.push(`${file.key} is missing`);
    else if ((await sha256OfFile(join(documentsDirectory, file.key))) !== file.sha256) {
      problems.push(`${file.key} has a different checksum`);
    }
  }
  const listed = new Set(expected.map((file) => file.key));
  for (const key of keys) if (!listed.has(key)) problems.push(`${key} is not in the archive`);
  return problems;
}

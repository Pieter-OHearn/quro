import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArchiveName } from './archiveNames';

// Retention deletes older unlabelled archives so that `keep` remain, counting the one just
// written. It runs only after that archive has been verified, never touches labelled archives
// (pre-restore, before-upgrade and other manual ones) and never touches other files.

export class RetentionError extends Error {
  constructor(
    readonly failed: string[],
    readonly deleted: string[],
  ) {
    super(`Could not delete ${failed.length} older archive(s): ${failed.join(', ')}`);
    this.name = 'RetentionError';
  }
}

export type RemoveFile = (path: string) => Promise<void>;

/** The unlabelled archives beyond the newest `keep`, oldest last; never `current`. */
export function archivesToDelete(
  names: readonly string[],
  keep: number,
  current: string,
): string[] {
  const unlabelled = names
    .filter((name) => name !== current)
    .filter((name) => parseArchiveName(name)?.label === null)
    .sort()
    .reverse();
  // The archive just written is one of the kept ones.
  return unlabelled.slice(Math.max(0, keep - 1));
}

/** Deletes what `archivesToDelete` names in the directory and returns the deleted names. */
export async function applyRetention(
  directory: string,
  keep: number,
  current: string,
  remove: RemoveFile = (path) => rm(path),
): Promise<string[]> {
  const doomed = archivesToDelete(await readdir(directory), keep, current);
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const name of doomed) {
    try {
      await remove(join(directory, name));
      deleted.push(name);
    } catch {
      failed.push(name);
    }
  }
  if (failed.length > 0) throw new RetentionError(failed, deleted);
  return deleted;
}

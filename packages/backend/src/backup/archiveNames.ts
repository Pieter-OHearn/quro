// Archive file names: `quro-backup-20261010-031500Z.tar`, with `-<label>` before the extension
// for labelled archives (`-pre-restore`, `-before-upgrade`) and `.enc` after it when encrypted.
// The time is UTC, so names sort in the order the archives were taken.

const NAME_PATTERN =
  /^quro-backup-(?<stamp>\d{8}-\d{6}Z)(?:-(?<label>[a-z0-9][a-z0-9-]{0,39}))?\.tar(?<enc>\.enc)?$/;
export const LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const PRE_RESTORE_LABEL = 'pre-restore';

const TWO_DIGITS = 2;
const pad = (value: number) => String(value).padStart(TWO_DIGITS, '0');

function utcStamp(date: Date): string {
  const day = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `${day}-${time}Z`;
}

export function archiveName(createdAt: Date, label: string | null, encrypted: boolean): string {
  const suffix = label ? `-${label}` : '';
  return `quro-backup-${utcStamp(createdAt)}${suffix}.tar${encrypted ? '.enc' : ''}`;
}

export type ParsedArchiveName = { stamp: string; label: string | null; encrypted: boolean };

/** The parts of an archive name `quro backup` wrote, or null for any other file. */
export function parseArchiveName(name: string): ParsedArchiveName | null {
  const groups = NAME_PATTERN.exec(name)?.groups;
  if (!groups) return null;
  return { stamp: groups.stamp!, label: groups.label ?? null, encrypted: groups.enc !== undefined };
}

/** Where an archive is written until it is complete and verified. Hidden, so nothing counts it. */
export function partialName(name: string): string {
  return `.${name}.partial`;
}

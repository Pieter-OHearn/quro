import { CSV_IMPORT_LIMITS } from '@quro/shared';

export class CsvFileError extends Error {}

/**
 * Reads a chosen file as text. Bank exports are UTF-8 or Windows-1252; a file that does not
 * decode as UTF-8 is read as Windows-1252 rather than shown with replacement characters.
 */
export async function readCsvFile(file: File): Promise<string> {
  if (file.size > CSV_IMPORT_LIMITS.maxBytes) {
    throw new CsvFileError(
      `The file is larger than ${CSV_IMPORT_LIMITS.maxBytes / 1_000_000} MB. Split it and import the parts.`,
    );
  }
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

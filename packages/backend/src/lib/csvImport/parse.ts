import { CSV_IMPORT_LIMITS, type CsvDelimiter } from '@quro/shared';

// A bounded CSV reader for bank exports (RFC 4180 with the usual variations): quoted fields with
// embedded delimiters, quotes and line breaks, CRLF, LF or CR line ends, a byte order mark, and a
// comma, semicolon, tab or pipe delimiter. It never evaluates a cell; a formula-looking cell is
// just text. Every limit comes with a message the reader can act on.

export type ParsedCsv = {
  delimiter: Exclude<CsvDelimiter, 'auto'>;
  headers: string[];
  records: CsvRecord[];
};

export type CsvRecord = {
  /** 1 for the first record after the header. */
  rowNumber: number;
  /** The physical line the record starts on. */
  line: number;
  cells: string[];
};

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

const CANDIDATES = [',', ';', '\t', '|'] as const;
const NUL = String.fromCharCode(0);

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** The delimiter that splits the header line into the most cells outside quotes. */
export function detectDelimiter(text: string): Exclude<CsvDelimiter, 'auto'> {
  const counts = new Map<string, number>(CANDIDATES.map((candidate) => [candidate, 0]));
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  let best: Exclude<CsvDelimiter, 'auto'> = ',';
  let bestCount = 0;
  for (const candidate of CANDIDATES) {
    const count = counts.get(candidate)!;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

type Separator = 'delimiter' | 'newline' | 'end';

/** Reads records one at a time from the text, tracking the physical line. */
class RecordReader {
  position = 0;
  line = 1;

  constructor(
    private readonly text: string,
    private readonly delimiter: string,
  ) {}

  private isCellEnd(char: string): boolean {
    return char === this.delimiter || char === '\n' || char === '\r';
  }

  private readPlain(): string {
    const start = this.position;
    while (this.position < this.text.length && !this.isCellEnd(this.text[this.position]!)) {
      this.position += 1;
    }
    return this.text.slice(start, this.position);
  }

  private readQuoted(startLine: number): string {
    let cell = '';
    this.position += 1;
    for (;;) {
      const close = this.text.indexOf('"', this.position);
      if (close === -1) {
        throw new CsvFormatError(`A quoted cell starting on line ${startLine} never ends`);
      }
      const chunk = this.text.slice(this.position, close);
      this.line += chunk.split('\n').length - 1;
      cell += chunk;
      if (this.text[close + 1] === '"') {
        cell += '"';
        this.position = close + 2;
      } else {
        this.position = close + 1;
        return cell + this.readPlain();
      }
    }
  }

  private readSeparator(): Separator {
    const char = this.text[this.position];
    if (char === undefined) return 'end';
    if (char === this.delimiter) {
      this.position += 1;
      return 'delimiter';
    }
    this.position += char === '\r' && this.text[this.position + 1] === '\n' ? 2 : 1;
    this.line += 1;
    return 'newline';
  }

  readRecord(): string[] | null {
    if (this.position >= this.text.length) return null;
    const startLine = this.line;
    const cells: string[] = [];
    let separator: Separator = 'delimiter';
    while (separator === 'delimiter') {
      const cell = this.text[this.position] === '"' ? this.readQuoted(startLine) : this.readPlain();
      if (cell.length > CSV_IMPORT_LIMITS.maxCellLength) {
        throw new CsvFormatError(
          `A cell on line ${startLine} is longer than ${CSV_IMPORT_LIMITS.maxCellLength} characters`,
        );
      }
      cells.push(cell);
      if (cells.length > CSV_IMPORT_LIMITS.maxColumns) {
        throw new CsvFormatError(`The file has more than ${CSV_IMPORT_LIMITS.maxColumns} columns`);
      }
      separator = this.readSeparator();
    }
    return cells;
  }
}

const isBlank = (cells: readonly string[]) => cells.every((cell) => cell.trim() === '');

function checkHeaders(headers: readonly string[]): void {
  const seen = new Set<string>();
  for (const header of headers) {
    if (header === '') throw new CsvFormatError('Every column needs a header name');
    if (seen.has(header)) throw new CsvFormatError(`The header "${header}" appears twice`);
    seen.add(header);
  }
}

function readText(input: string): string {
  if (input.length > CSV_IMPORT_LIMITS.maxBytes) {
    throw new CsvFormatError(
      `The file is larger than ${CSV_IMPORT_LIMITS.maxBytes / 1_000_000} MB; split it and import the parts`,
    );
  }
  const text = stripBom(input);
  if (text.includes(NUL)) throw new CsvFormatError('The file is not a text file');
  return text;
}

/**
 * Reads the header and up to `maxRows` data records. Blank lines are skipped. A record with a
 * different number of cells than the header is returned as is; the row check reports it.
 */
export function parseCsv(input: string, requested: CsvDelimiter = 'auto'): ParsedCsv {
  const text = readText(input);
  const delimiter = requested === 'auto' ? detectDelimiter(text) : requested;
  const reader = new RecordReader(text, delimiter);

  let headers: string[] | null = null;
  const records: CsvRecord[] = [];
  for (;;) {
    const line = reader.line;
    const cells = reader.readRecord();
    if (cells === null) break;
    if (isBlank(cells)) continue;
    if (headers === null) {
      headers = cells.map((header) => header.trim());
    } else {
      if (records.length >= CSV_IMPORT_LIMITS.maxRows) {
        throw new CsvFormatError(
          `The file has more than ${CSV_IMPORT_LIMITS.maxRows} rows; split it and import the parts`,
        );
      }
      records.push({ rowNumber: records.length + 1, line, cells });
    }
  }
  if (headers === null) throw new CsvFormatError('The file is empty');
  checkHeaders(headers);
  return { delimiter, headers, records };
}

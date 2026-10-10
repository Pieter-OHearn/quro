// A minimal POSIX tar (ustar with pax extended headers) writer and a strict reader, so backups
// stream through hashing and encryption in one pass and need no `tar` binary. Archives open with
// any tar tool. The reader accepts only regular files with safe relative paths: it is used on
// archives that may have been damaged or replaced, never to extract arbitrary tar files.

const BLOCK = 512;
const END_BLOCKS = 2;
const MAX_USTAR_NAME = 100;
// Eleven octal digits: 8 GiB - 1. Larger entries carry their size in a pax header.
const MAX_USTAR_SIZE = 0o77777777777;
const FILE_MODE = 0o600;
// Quro writes a path and a size; anything near this is not one of its archives.
const MAX_PAX_HEADER_BYTES = 65_536;
const TYPE_FILE = '0';
const TYPE_PAX = 'x';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// Byte offsets and lengths of the POSIX ustar header fields.
/* eslint-disable no-magic-numbers */
const FIELD = {
  name: [0, 100],
  mode: [100, 8],
  uid: [108, 8],
  gid: [116, 8],
  size: [124, 12],
  mtime: [136, 12],
  checksum: [148, 8],
  type: [156, 1],
  magic: [257, 6],
  version: [263, 2],
  prefix: [345, 155],
} as const;
/* eslint-enable no-magic-numbers */
const OCTAL = 8;
const CHECKSUM_DIGITS = 6;
const ASCII_SPACE = 0x20;

export class TarFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TarFormatError';
  }
}

export type ByteSink = { write(bytes: Uint8Array): Promise<void> };

function putText(header: Uint8Array, [offset, length]: readonly [number, number], text: string) {
  const bytes = encoder.encode(text);
  header.set(bytes.subarray(0, length), offset);
}

function putOctal(header: Uint8Array, field: readonly [number, number], value: number) {
  putText(header, field, `${value.toString(OCTAL).padStart(field[1] - 1, '0')}\0`);
}

function checksumOf(header: Uint8Array): number {
  let sum = 0;
  for (let index = 0; index < BLOCK; index += 1) {
    const inChecksum = index >= FIELD.checksum[0] && index < FIELD.checksum[0] + FIELD.checksum[1];
    sum += inChecksum ? ASCII_SPACE : header[index]!;
  }
  return sum;
}

function buildHeader(name: string, size: number, type: string, mtimeSeconds: number): Uint8Array {
  const header = new Uint8Array(BLOCK);
  putText(header, FIELD.name, name);
  putOctal(header, FIELD.mode, FILE_MODE);
  putOctal(header, FIELD.uid, 0);
  putOctal(header, FIELD.gid, 0);
  putOctal(header, FIELD.size, size);
  putOctal(header, FIELD.mtime, mtimeSeconds);
  putText(header, FIELD.type, type);
  putText(header, FIELD.magic, 'ustar\0');
  putText(header, FIELD.version, '00');
  putText(
    header,
    FIELD.checksum,
    `${checksumOf(header).toString(OCTAL).padStart(CHECKSUM_DIGITS, '0')}\0 `,
  );
  return header;
}

/** One pax record, `<length> <key>=<value>\n`, where the length counts itself. */
function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = encoder.encode(body).length;
  while (`${length}`.length + encoder.encode(body).length !== length) {
    length = `${length}`.length + encoder.encode(body).length;
  }
  return `${length}${body}`;
}

function padding(size: number): Uint8Array {
  const remainder = size % BLOCK;
  return new Uint8Array(remainder === 0 ? 0 : BLOCK - remainder);
}

export class TarWriter {
  private readonly mtimeSeconds: number;

  constructor(
    private readonly sink: ByteSink,
    mtime: Date,
  ) {
    this.mtimeSeconds = Math.floor(mtime.getTime() / 1000);
  }

  /** Writes one file. `body` must yield exactly `size` bytes. */
  async addFile(
    path: string,
    size: number,
    body: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  ): Promise<void> {
    const records: string[] = [];
    if (encoder.encode(path).length > MAX_USTAR_NAME) records.push(paxRecord('path', path));
    if (size > MAX_USTAR_SIZE) records.push(paxRecord('size', String(size)));
    if (records.length > 0) {
      const pax = encoder.encode(records.join(''));
      await this.sink.write(buildHeader('PaxHeader', pax.length, TYPE_PAX, this.mtimeSeconds));
      await this.sink.write(pax);
      await this.sink.write(padding(pax.length));
    }
    const shortName = path.slice(0, MAX_USTAR_NAME);
    const headerSize = size > MAX_USTAR_SIZE ? 0 : size;
    await this.sink.write(buildHeader(shortName, headerSize, TYPE_FILE, this.mtimeSeconds));
    let written = 0;
    for await (const chunk of body) {
      written += chunk.length;
      if (written > size) throw new TarFormatError(`${path} grew while it was archived`);
      await this.sink.write(chunk);
    }
    if (written !== size) throw new TarFormatError(`${path} shrank while it was archived`);
    await this.sink.write(padding(size));
  }

  async addBytes(path: string, bytes: Uint8Array): Promise<void> {
    await this.addFile(path, bytes.length, [bytes]);
  }

  /** Writes the end-of-archive marker. */
  async finish(): Promise<void> {
    await this.sink.write(new Uint8Array(BLOCK * END_BLOCKS));
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────

/** Reads exact byte counts from a stream of chunks. */
class ByteReader {
  private buffer = new Uint8Array(0);
  private done = false;

  constructor(private readonly chunks: AsyncIterator<Uint8Array>) {}

  private async fill(): Promise<boolean> {
    if (this.done) return false;
    const next = await this.chunks.next();
    if (next.done) {
      this.done = true;
      return false;
    }
    const joined = new Uint8Array(this.buffer.length + next.value.length);
    joined.set(this.buffer);
    joined.set(next.value, this.buffer.length);
    this.buffer = joined;
    return true;
  }

  /** Up to `limit` bytes, at least one, or null at the end of the stream. */
  async some(limit: number): Promise<Uint8Array | null> {
    while (this.buffer.length === 0) {
      if (!(await this.fill())) return null;
    }
    const taken = this.buffer.subarray(0, Math.min(limit, this.buffer.length));
    this.buffer = this.buffer.subarray(taken.length);
    return taken;
  }

  /** Exactly `count` bytes; throws when the stream ends first. */
  async exactly(count: number): Promise<Uint8Array> {
    while (this.buffer.length < count) {
      if (!(await this.fill())) throw new TarFormatError('The archive ends unexpectedly');
    }
    const taken = this.buffer.slice(0, count);
    this.buffer = this.buffer.subarray(count);
    return taken;
  }

  /** `count` bytes as chunks. `remaining` says how many the consumer has not read yet. */
  body(count: number): { chunks: AsyncIterable<Uint8Array>; remaining: () => number } {
    let left = count;
    const next = async (): Promise<IteratorResult<Uint8Array>> => {
      if (left === 0) return { done: true, value: undefined };
      const chunk = await this.some(left);
      if (!chunk) throw new TarFormatError('The archive ends unexpectedly');
      left -= chunk.length;
      return { done: false, value: chunk };
    };
    return {
      chunks: { [Symbol.asyncIterator]: () => ({ next }) },
      remaining: () => left,
    };
  }

  async skip(count: number): Promise<void> {
    let left = count;
    while (left > 0) {
      const chunk = await this.some(left);
      if (!chunk) throw new TarFormatError('The archive ends unexpectedly');
      left -= chunk.length;
    }
  }

  /** Everything up to the end of the stream must be zero bytes. */
  async expectOnlyZeros(): Promise<void> {
    for (;;) {
      const chunk = await this.some(Number.MAX_SAFE_INTEGER);
      if (!chunk) return;
      if (chunk.some((byte) => byte !== 0)) {
        throw new TarFormatError('The archive has data after its end marker');
      }
    }
  }
}

function decode(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new TarFormatError('The archive has a damaged entry header (not UTF-8)');
  }
}

function readText(header: Uint8Array, [offset, length]: readonly [number, number]): string {
  const field = header.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return decode(end < 0 ? field : field.subarray(0, end));
}

function readOctal(header: Uint8Array, field: readonly [number, number]): number {
  const text = readText(header, field).trim();
  if (!/^[0-7]+$/.test(text)) throw new TarFormatError('The archive has a damaged entry header');
  return Number.parseInt(text, OCTAL);
}

const NEWLINE = 0x0a;

function parsePax(bytes: Uint8Array): Map<string, string> {
  const records = new Map<string, string>();
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(ASCII_SPACE, offset);
    const length = space > offset ? Number(decode(bytes.subarray(offset, space))) : 0;
    const end = offset + length;
    if (
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      end > bytes.length ||
      bytes[end - 1] !== NEWLINE
    ) {
      throw new TarFormatError('The archive has a damaged extended header');
    }
    const record = decode(bytes.subarray(space + 1, end - 1));
    const equals = record.indexOf('=');
    if (equals <= 0) throw new TarFormatError('The archive has a damaged extended header');
    records.set(record.slice(0, equals), record.slice(equals + 1));
    offset = end;
  }
  return records;
}

export type TarEntry = { path: string; size: number };

type Header = { name: string; size: number; type: string };

function parseHeader(block: Uint8Array): Header {
  if (readText(block, FIELD.magic) !== 'ustar') {
    throw new TarFormatError('The file is not a Quro backup archive (no tar header)');
  }
  if (readOctal(block, FIELD.checksum) !== checksumOf(block)) {
    throw new TarFormatError('The archive has a damaged entry header (checksum mismatch)');
  }
  const prefix = readText(block, FIELD.prefix);
  const name = readText(block, FIELD.name);
  return {
    name: prefix ? `${prefix}/${name}` : name,
    size: readOctal(block, FIELD.size),
    type: readText(block, FIELD.type) || TYPE_FILE,
  };
}

const isZeroBlock = (block: Uint8Array) => block.every((byte) => byte === 0);

async function readPaxHeader(reader: ByteReader, size: number): Promise<Map<string, string>> {
  if (size > MAX_PAX_HEADER_BYTES) {
    throw new TarFormatError('The archive has an oversized extended header');
  }
  const records = parsePax(await reader.exactly(size));
  await reader.skip(padding(size).length);
  return records;
}

function fileEntry(header: Header, pax: Map<string, string>): TarEntry {
  if (header.type !== TYPE_FILE) {
    throw new TarFormatError(`The archive holds an entry that is not a regular file`);
  }
  const size = pax.has('size') ? Number(pax.get('size')) : header.size;
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new TarFormatError('The archive has a damaged entry size');
  }
  return { path: pax.get('path') ?? header.name, size };
}

async function nextEntry(reader: ByteReader): Promise<TarEntry | null> {
  let pax = new Map<string, string>();
  for (;;) {
    const block = await reader.exactly(BLOCK);
    if (isZeroBlock(block)) {
      if (!isZeroBlock(await reader.exactly(BLOCK))) {
        throw new TarFormatError('The archive has a damaged end marker');
      }
      return null;
    }
    const header = parseHeader(block);
    if (header.type !== TYPE_PAX) return fileEntry(header, pax);
    pax = await readPaxHeader(reader, header.size);
  }
}

/**
 * Calls `onEntry` for every file in order. `onEntry` may read the body or leave it; an unread
 * body is skipped. After the end marker only zero padding may follow.
 */
export async function readTar(
  chunks: AsyncIterable<Uint8Array>,
  onEntry: (entry: TarEntry, body: AsyncIterable<Uint8Array>) => Promise<void>,
): Promise<void> {
  const reader = new ByteReader(chunks[Symbol.asyncIterator]());
  for (;;) {
    const entry = await nextEntry(reader);
    if (!entry) break;
    const body = reader.body(entry.size);
    await onEntry(entry, body.chunks);
    // Skip whatever the handler left unread, then the block padding.
    await reader.skip(body.remaining() + padding(entry.size).length);
  }
  await reader.expectOnlyZeros();
}

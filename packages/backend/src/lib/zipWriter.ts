import { crc32, deflateRawSync } from 'node:zlib';

// A small ZIP writer for data exports: one entry at a time, each written as soon as its bytes are
// known, then a central directory. Text is deflated, documents are stored as they are. The format
// is plain ZIP (no ZIP64), so an archive stays under 4 GiB and 65,535 entries; the export bounds
// its size well below both. Names are UTF-8 (general purpose flag bit 11).

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = 20;
const UTF8_NAMES_FLAG = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const MAX_UINT32 = 0xffffffff;
const MAX_UINT16 = 0xffff;
const DOS_EPOCH_YEAR = 1980;

export const MAX_ZIP_ENTRIES = MAX_UINT16;
export const MAX_ZIP_BYTES = MAX_UINT32;

export class ZipLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipLimitError';
  }
}

type CentralRecord = {
  name: Buffer;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
};

/** MS-DOS date and time fields (local fields, two-second resolution), from a UTC instant. */
function dosDateTime(at: Date): { date: number; time: number } {
  const year = Math.max(at.getUTCFullYear(), DOS_EPOCH_YEAR);
  return {
    date: ((year - DOS_EPOCH_YEAR) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
  };
}

export type ZipEntryOptions = {
  /** Deflate the bytes (text) or store them as they are (PDFs are already compressed). */
  compress: boolean;
};

/**
 * Builds a ZIP archive entry by entry. `addEntry` returns the bytes to send for that entry, and
 * `finish` the central directory; concatenated in order they are the archive.
 */
export function createZipWriter(modifiedAt: Date) {
  const records: CentralRecord[] = [];
  const stamp = dosDateTime(modifiedAt);
  let offset = 0;

  function addEntry(path: string, data: Uint8Array, options: ZipEntryOptions): Buffer {
    if (records.length >= MAX_ZIP_ENTRIES - 1) throw new ZipLimitError('Too many archive entries');
    const name = Buffer.from(path, 'utf8');
    const body = options.compress ? deflateRawSync(data) : Buffer.from(data);
    const method = options.compress ? METHOD_DEFLATE : METHOD_STORE;
    const crc = crc32(data);
    const size = data.byteLength;
    const header = Buffer.alloc(LOCAL_HEADER_SIZE);
    header.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    header.writeUInt16LE(VERSION_NEEDED, 4);
    header.writeUInt16LE(UTF8_NAMES_FLAG, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(stamp.time, 10);
    header.writeUInt16LE(stamp.date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.byteLength, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(name.byteLength, 26);
    header.writeUInt16LE(0, 28);
    const entry = Buffer.concat([header, name, body]);
    if (offset + entry.byteLength > MAX_ZIP_BYTES) throw new ZipLimitError('Archive too large');
    records.push({ name, method, crc, compressedSize: body.byteLength, size, offset });
    offset += entry.byteLength;
    return entry;
  }

  function finish(): Buffer {
    const centralParts: Buffer[] = [];
    for (const record of records) {
      const header = Buffer.alloc(CENTRAL_HEADER_SIZE);
      header.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
      header.writeUInt16LE(VERSION_MADE_BY, 4);
      header.writeUInt16LE(VERSION_NEEDED, 6);
      header.writeUInt16LE(UTF8_NAMES_FLAG, 8);
      header.writeUInt16LE(record.method, 10);
      header.writeUInt16LE(stamp.time, 12);
      header.writeUInt16LE(stamp.date, 14);
      header.writeUInt32LE(record.crc, 16);
      header.writeUInt32LE(record.compressedSize, 20);
      header.writeUInt32LE(record.size, 24);
      header.writeUInt16LE(record.name.byteLength, 28);
      // Extra field, comment, disk number, internal and external attributes stay zero.
      header.writeUInt32LE(record.offset, 42);
      centralParts.push(header, record.name);
    }
    const central = Buffer.concat(centralParts);
    if (offset + central.byteLength + END_RECORD_SIZE > MAX_ZIP_BYTES) {
      throw new ZipLimitError('Archive too large');
    }
    const end = Buffer.alloc(END_RECORD_SIZE);
    end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
    end.writeUInt16LE(records.length, 8);
    end.writeUInt16LE(records.length, 10);
    end.writeUInt32LE(central.byteLength, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([central, end]);
  }

  return { addEntry, finish, entryCount: () => records.length };
}

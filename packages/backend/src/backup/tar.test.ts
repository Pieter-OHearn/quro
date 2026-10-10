import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTar, TarFormatError, TarWriter, type ByteSink } from './tar';

const encoder = new TextEncoder();

class MemorySink implements ByteSink {
  readonly parts: Uint8Array[] = [];
  write(bytes: Uint8Array): Promise<void> {
    this.parts.push(bytes.slice());
    return Promise.resolve();
  }
  bytes(): Uint8Array {
    // A plain Uint8Array: Buffer#slice returns a view, and the tests change copies.
    return new Uint8Array(Buffer.concat(this.parts));
  }
}

async function buildArchive(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  const sink = new MemorySink();
  const tar = new TarWriter(sink, new Date('2026-10-10T03:15:00Z'));
  for (const [path, bytes] of Object.entries(entries)) await tar.addBytes(path, bytes);
  await tar.finish();
  return sink.bytes();
}

async function* chunked(bytes: Uint8Array, size: number): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.length; offset += size) {
    yield bytes.subarray(offset, offset + size);
  }
}

async function readAll(bytes: Uint8Array, chunkSize = 777) {
  const entries: Record<string, string> = {};
  await readTar(chunked(bytes, chunkSize), async (entry, body) => {
    const parts: Uint8Array[] = [];
    for await (const chunk of body) parts.push(chunk);
    entries[entry.path] = Buffer.concat(parts).toString('utf8');
  });
  return entries;
}

const LONG_KEY = `documents/users/1/${'a'.repeat(120)}/${'b'.repeat(90)}.pdf`;

describe('tar archives', () => {
  let workspace: string;
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'quro-tar-'));
  });
  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  test('round-trip files of any size, including long paths, in any chunking', async () => {
    const files = {
      'database.dump': encoder.encode('x'.repeat(1500)),
      'documents/users/1/a.pdf': encoder.encode('%PDF-1.4 synthetic'),
      [LONG_KEY]: encoder.encode('long'),
      'empty.txt': new Uint8Array(0),
      'manifest.json': encoder.encode('{}'),
    };
    const archive = await buildArchive(files);
    for (const size of [1, 511, 512, 4096, archive.length]) {
      const read = await readAll(archive, size);
      expect(Object.keys(read)).toEqual(Object.keys(files));
      expect(read['database.dump']).toBe('x'.repeat(1500));
      expect(read[LONG_KEY]).toBe('long');
    }
  });

  test('the system tar lists the same entries', async () => {
    const archive = await buildArchive({
      'manifest.json': encoder.encode('{}'),
      [LONG_KEY]: encoder.encode('long'),
    });
    const path = join(workspace, 'archive.tar');
    writeFileSync(path, archive);
    const listed = Bun.spawnSync(['tar', '-tf', path]);
    expect(listed.exitCode).toBe(0);
    expect(listed.stdout.toString().trim().split('\n')).toEqual(['manifest.json', LONG_KEY]);
    const out = join(workspace, 'out');
    Bun.spawnSync(['mkdir', out]);
    expect(Bun.spawnSync(['tar', '-xf', path, '-C', out]).exitCode).toBe(0);
    expect(readFileSync(join(out, LONG_KEY), 'utf8')).toBe('long');
  });

  test('an unread body is skipped and the next entry is still found', async () => {
    const archive = await buildArchive({
      'a.bin': encoder.encode('a'.repeat(2000)),
      'b.txt': encoder.encode('b'),
    });
    const seen: string[] = [];
    await readTar(chunked(archive, 100), async (entry, body) => {
      seen.push(entry.path);
      if (entry.path === 'a.bin') {
        // Read one chunk and stop.
        for await (const chunk of body) {
          expect(chunk.length).toBeGreaterThan(0);
          break;
        }
      }
    });
    expect(seen).toEqual(['a.bin', 'b.txt']);
  });

  test('a writer refuses a body that does not have the announced size', async () => {
    const tar = new TarWriter(new MemorySink(), new Date());
    await expect(tar.addFile('x', 5, [encoder.encode('abc')])).rejects.toThrow('shrank');
    await expect(tar.addFile('y', 2, [encoder.encode('abc')])).rejects.toThrow('grew');
  });

  test('damage is detected: header checksum, truncation, trailing data, other entry types', async () => {
    const archive = await buildArchive({ 'a.txt': encoder.encode('hello') });

    const header = archive.slice();
    header[10] = header[10]! ^ 0xff;
    await expect(readAll(header)).rejects.toThrow(TarFormatError);

    await expect(readAll(archive.subarray(0, 700))).rejects.toThrow('ends unexpectedly');
    await expect(readAll(archive.subarray(0, 1024))).rejects.toThrow('ends unexpectedly');

    const trailing = Buffer.concat([archive, encoder.encode('extra')]);
    await expect(readAll(trailing)).rejects.toThrow('after its end marker');

    const symlink = archive.slice();
    symlink[156] = '2'.charCodeAt(0);
    // Fix the header checksum so only the type is wrong.
    let sum = 0;
    for (let index = 0; index < 512; index += 1) {
      sum += index >= 148 && index < 156 ? 0x20 : symlink[index]!;
    }
    symlink.set(encoder.encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148);
    await expect(readAll(symlink)).rejects.toThrow('not a regular file');

    await expect(readAll(encoder.encode('not a tar file'.repeat(100)))).rejects.toThrow(
      TarFormatError,
    );
  });
});

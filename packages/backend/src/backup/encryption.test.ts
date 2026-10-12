import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Secret } from '../config';
import {
  ArchiveDecryptionError,
  decryptFile,
  EncryptingSink,
  ENCRYPTION_HEADER_BYTES,
  isEncryptedHeader,
} from './encryption';
import { FileSink } from './files';

const KEY = new Secret('synthetic-backup-key-for-tests-0123456789');
const OTHER_KEY = new Secret('another-synthetic-key-for-tests-9876543210');

let workspace: string;
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'quro-encryption-'));
});
afterEach(() => rmSync(workspace, { recursive: true, force: true }));

async function encrypt(plaintext: Uint8Array, name = 'archive.tar.enc'): Promise<string> {
  const path = join(workspace, name);
  const file = await FileSink.create(path);
  const sink = await EncryptingSink.open(file, KEY);
  // Several writes, as the tar writer does.
  for (let offset = 0; offset < plaintext.length; offset += 1000) {
    await sink.write(plaintext.subarray(offset, offset + 1000));
  }
  await sink.finish();
  await file.close();
  return path;
}

async function decrypt(path: string, key = KEY): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const chunk of decryptFile(path, key)) parts.push(chunk);
  return Buffer.concat(parts);
}

const plaintext = new Uint8Array(250_000).map((_, index) => index % 251);

describe('archive encryption', () => {
  test('round-trips and starts with the recognisable header', async () => {
    const path = await encrypt(plaintext);
    const stored = readFileSync(path);
    expect(isEncryptedHeader(stored.subarray(0, 8))).toBe(true);
    expect(stored.length).toBe(plaintext.length + ENCRYPTION_HEADER_BYTES + 16);
    // No plaintext run survives.
    expect(stored.includes(Buffer.from(plaintext.subarray(1000, 1100)))).toBe(false);
    expect(Buffer.compare(await decrypt(path), plaintext)).toBe(0);
  });

  test('two encryptions of the same data differ (fresh salt and nonce)', async () => {
    const first = readFileSync(await encrypt(plaintext, 'a.enc'));
    const second = readFileSync(await encrypt(plaintext, 'b.enc'));
    expect(first.equals(second)).toBe(false);
  });

  test('a wrong key, a changed byte, a changed header or a truncated file fails', async () => {
    const path = await encrypt(plaintext);
    await expect(decrypt(path, OTHER_KEY)).rejects.toThrow(ArchiveDecryptionError);

    const original = readFileSync(path);
    const flipped = Buffer.from(original);
    flipped[ENCRYPTION_HEADER_BYTES + 5000] = flipped[ENCRYPTION_HEADER_BYTES + 5000]! ^ 1;
    writeFileSync(path, flipped);
    await expect(decrypt(path)).rejects.toThrow(ArchiveDecryptionError);

    const salted = Buffer.from(original);
    salted[20] = salted[20]! ^ 1;
    writeFileSync(path, salted);
    await expect(decrypt(path)).rejects.toThrow(ArchiveDecryptionError);

    writeFileSync(path, original.subarray(0, original.length - 100));
    await expect(decrypt(path)).rejects.toThrow(ArchiveDecryptionError);

    writeFileSync(path, original.subarray(0, 30));
    await expect(decrypt(path)).rejects.toThrow('truncated');

    const greedy = Buffer.from(original);
    greedy[9] = 30; // scrypt log2 N far above the limit
    writeFileSync(path, greedy);
    await expect(decrypt(path)).rejects.toThrow('damaged header');
  });
});

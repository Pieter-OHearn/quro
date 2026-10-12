import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  type CipherGCM,
  type ScryptOptions,
} from 'node:crypto';
import type { Secret } from '../config';
import type { ByteSink } from './tar';

// Encrypted archives: AES-256-GCM over the whole tar stream, with a key derived from the
// operator's key file by scrypt. Layout:
//
//   "QUROENC1" | algorithm (1) | scrypt log2 N, r, p (1 each) | salt (16) | nonce (12)
//   ciphertext
//   authentication tag (16)
//
// The 40-byte header is authenticated as associated data. A wrong key, a changed byte or a
// truncated file fails the tag check at the end of decryption; nothing read from an archive is
// used before that check has passed (see verifyArchive.ts). One key and nonce may encrypt at most
// 64 GiB with GCM, far above a household's backup.

const MAGIC = new TextEncoder().encode('QUROENC1');
const ALGORITHM_AES_256_GCM_SCRYPT = 1;
const SALT_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
// Algorithm, scrypt log2 N, r and p, one byte each.
const PARAMETER_BYTES = 4;
export const ENCRYPTION_HEADER_BYTES = MAGIC.length + PARAMETER_BYTES + SALT_BYTES + NONCE_BYTES;
// GCM's limit for one key and nonce: 2^36 - 32 bytes.
const GCM_MAX_PLAINTEXT_BYTES = 68_719_476_704;

// scrypt N = 2^15, r = 8 needs 32 MiB; the limits keep a crafted header from asking for more.
const SCRYPT_DEFAULTS = { log2N: 15, r: 8, p: 1 };
// eslint-disable-next-line no-magic-numbers
const SCRYPT_LIMITS = { log2N: [14, 20], r: [1, 16], p: [1, 4] } as const;
const SCRYPT_MEMORY_FACTOR = 128;
const SCRYPT_MEMORY_SLACK = 2;

export class ArchiveDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveDecryptionError';
  }
}

type KeyParameters = { log2N: number; r: number; p: number; salt: Uint8Array };

function deriveKey(secret: Secret, parameters: KeyParameters): Promise<Buffer> {
  const { log2N, r, p, salt } = parameters;
  const N = 1 << log2N;
  const options: ScryptOptions = {
    N,
    r,
    p,
    maxmem: SCRYPT_MEMORY_FACTOR * N * r * SCRYPT_MEMORY_SLACK,
  };
  return new Promise((resolve, reject) => {
    scrypt(secret.reveal(), salt, KEY_BYTES, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

function buildHeader(parameters: KeyParameters, nonce: Uint8Array): Uint8Array {
  const header = new Uint8Array(ENCRYPTION_HEADER_BYTES);
  header.set(MAGIC, 0);
  let offset = MAGIC.length;
  for (const value of [
    ALGORITHM_AES_256_GCM_SCRYPT,
    parameters.log2N,
    parameters.r,
    parameters.p,
  ]) {
    header[offset] = value;
    offset += 1;
  }
  header.set(parameters.salt, offset);
  header.set(nonce, offset + SALT_BYTES);
  return header;
}

/** Whether the first bytes of a file are an encrypted archive's header. */
export function isEncryptedHeader(firstBytes: Uint8Array): boolean {
  return (
    firstBytes.length >= MAGIC.length && MAGIC.every((byte, index) => firstBytes[index] === byte)
  );
}

/** Encrypts everything written to it into `target`: the header first, the tag on `finish`. */
export class EncryptingSink implements ByteSink {
  private plaintextBytes = 0;

  private constructor(
    private readonly target: ByteSink,
    private readonly cipher: CipherGCM,
  ) {}

  static async open(target: ByteSink, key: Secret): Promise<EncryptingSink> {
    const parameters = { ...SCRYPT_DEFAULTS, salt: randomBytes(SALT_BYTES) };
    const nonce = randomBytes(NONCE_BYTES);
    const header = buildHeader(parameters, nonce);
    const cipher = createCipheriv('aes-256-gcm', await deriveKey(key, parameters), nonce);
    cipher.setAAD(header);
    await target.write(header);
    return new EncryptingSink(target, cipher);
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.plaintextBytes += bytes.length;
    if (this.plaintextBytes > GCM_MAX_PLAINTEXT_BYTES) {
      throw new Error('The archive is too large to encrypt in one piece (64 GiB).');
    }
    await this.target.write(this.cipher.update(bytes));
  }

  async finish(): Promise<void> {
    await this.target.write(this.cipher.final());
    await this.target.write(this.cipher.getAuthTag());
  }
}

function within(value: number, [low, high]: readonly [number, number]): boolean {
  return value >= low && value <= high;
}

function parseHeader(header: Uint8Array): { parameters: KeyParameters; nonce: Uint8Array } {
  const at = MAGIC.length;
  const [algorithm, log2N, r, p] = header.subarray(at, at + PARAMETER_BYTES);
  const valid =
    isEncryptedHeader(header) &&
    algorithm === ALGORITHM_AES_256_GCM_SCRYPT &&
    within(log2N!, SCRYPT_LIMITS.log2N) &&
    within(r!, SCRYPT_LIMITS.r) &&
    within(p!, SCRYPT_LIMITS.p);
  if (!valid) throw new ArchiveDecryptionError('The encrypted archive has a damaged header.');
  const saltAt = at + PARAMETER_BYTES;
  return {
    parameters: {
      log2N: log2N!,
      r: r!,
      p: p!,
      salt: header.subarray(saltAt, saltAt + SALT_BYTES),
    },
    nonce: header.subarray(saltAt + SALT_BYTES, saltAt + SALT_BYTES + NONCE_BYTES),
  };
}

const AUTHENTICATION_FAILED =
  'The archive could not be decrypted: the key is not the one it was encrypted with, or the archive is damaged.';

/**
 * The plaintext of an encrypted archive, chunk by chunk. The last step checks the authentication
 * tag and throws `ArchiveDecryptionError` when it does not match, so a consumer must read to the
 * end before it trusts anything it has seen.
 */
export async function* decryptFile(path: string, key: Secret): AsyncGenerator<Uint8Array> {
  const file = Bun.file(path);
  const size = file.size;
  if (size < ENCRYPTION_HEADER_BYTES + TAG_BYTES) {
    throw new ArchiveDecryptionError('The encrypted archive is truncated.');
  }
  const header = new Uint8Array(await file.slice(0, ENCRYPTION_HEADER_BYTES).arrayBuffer());
  const tag = new Uint8Array(await file.slice(size - TAG_BYTES, size).arrayBuffer());
  const { parameters, nonce } = parseHeader(header);
  const decipher = createDecipheriv('aes-256-gcm', await deriveKey(key, parameters), nonce);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  for await (const chunk of file.slice(ENCRYPTION_HEADER_BYTES, size - TAG_BYTES).stream()) {
    const plaintext = decipher.update(chunk);
    if (plaintext.length > 0) yield plaintext;
  }
  let last: Buffer;
  try {
    last = decipher.final();
  } catch {
    throw new ArchiveDecryptionError(AUTHENTICATION_FAILED);
  }
  if (last.length > 0) yield last;
}

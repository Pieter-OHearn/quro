import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

// Integration secrets (bank-link tokens and keys) are stored encrypted, each value as one text
// envelope in its own column:
//
//   quro-secret:v1:aes-256-gcm:<key id>:<nonce>:<ciphertext>:<tag>
//
// - `v1` is the envelope version and `aes-256-gcm` the algorithm; a value with any other version
//   or algorithm is refused, never guessed at.
// - The key id is 16 hexadecimal characters derived from the operator's key with HKDF-SHA256 under
//   its own label. It says which key sealed a value and reveals nothing about the key.
// - The nonce (12 random bytes per value), the ciphertext and the 16-byte GCM tag are base64url
//   without padding.
// - The associated data is the envelope header up to the key id plus the value's place: table,
//   column and the row's owner. A value copied into another column or another user's row fails
//   its tag check like a changed byte or a wrong key.
//
// The operator's key is 32 random bytes written as 64 hexadecimal characters. The AES key is
// derived from it with HKDF-SHA256 under a label of its own, so the stored key id and the
// encryption key are independent. docs/security.md describes the format for operators.

const ENVELOPE_PREFIX = 'quro-secret:';
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const HEADER = `${ENVELOPE_PREFIX}${VERSION}:${ALGORITHM}`;
const ENVELOPE_PARTS = 7;

const KEY_BYTES = 32;
const KEY_ID_BYTES = 8;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX = /^[0-9a-f]{64}$/i;
const KEY_ID = /^[0-9a-f]{16}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

const ENCRYPTION_LABEL = 'quro integration secrets v1 aes-256-gcm';
const KEY_ID_LABEL = 'quro integration secrets v1 key id';

/** Where a secret lives. Bound into its envelope, so it cannot be moved elsewhere. */
export type SecretPlace = { table: string; column: string; ownerId: number };

/** A key file that is not 64 hexadecimal characters. The message never contains the content. */
export class SecretsKeyFormatError extends Error {}

const SECRETS_KEY_FORMAT =
  '64 hexadecimal characters (32 random bytes), for example from `openssl rand -hex 32`';

function derive(material: Buffer, label: string, length: number): Buffer {
  return Buffer.from(hkdfSync('sha256', material, Buffer.alloc(0), label, length));
}

/**
 * The operator's key. Holds only derived keys; logging, interpolating or serialising it shows the
 * key id, never key material.
 */
export class SecretsKey {
  readonly id: string;
  readonly #encryptionKey: Buffer;

  private constructor(id: string, encryptionKey: Buffer) {
    this.id = id;
    this.#encryptionKey = encryptionKey;
  }

  /** Parses the content of a key file (without its trailing newline). */
  static parse(text: string): SecretsKey {
    if (!KEY_HEX.test(text)) throw new SecretsKeyFormatError(`must be ${SECRETS_KEY_FORMAT}`);
    const material = Buffer.from(text, 'hex');
    if (material.every((byte) => byte === material[0])) {
      throw new SecretsKeyFormatError(
        `repeats one byte, which looks like a placeholder; generate ${SECRETS_KEY_FORMAT}`,
      );
    }
    const id = derive(material, KEY_ID_LABEL, KEY_ID_BYTES).toString('hex');
    const key = new SecretsKey(id, derive(material, ENCRYPTION_LABEL, KEY_BYTES));
    material.fill(0);
    return key;
  }

  /** Encrypts `plaintext` for `place` with a fresh nonce. */
  seal(plaintext: string, place: SecretPlace): string {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#encryptionKey, nonce, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(associatedData(this.id, place));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      HEADER,
      this.id,
      nonce.toString('base64url'),
      ciphertext.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
    ].join(':');
  }

  /** @internal Opens a parsed envelope that names this key. Throws on a failed tag check. */
  open(envelope: ParsedEnvelope, place: SecretPlace): string {
    const decipher = createDecipheriv(ALGORITHM, this.#encryptionKey, envelope.nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(associatedData(this.id, place));
    decipher.setAuthTag(envelope.tag);
    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString('utf8');
  }

  toString(): string {
    return `[secrets key ${this.id}]`;
  }

  toJSON(): string {
    return this.toString();
  }

  [inspect.custom](): string {
    return this.toString();
  }
}

function associatedData(keyId: string, place: SecretPlace): Buffer {
  return Buffer.from(`${HEADER}:${keyId}|${place.table}.${place.column}#${place.ownerId}`, 'utf8');
}

type ParsedEnvelope = { keyId: string; nonce: Buffer; ciphertext: Buffer; tag: Buffer };

function decodePart(part: string, bytes?: number): Buffer | null {
  if (!BASE64URL.test(part)) return null;
  const decoded = Buffer.from(part, 'base64url');
  if (decoded.toString('base64url') !== part) return null;
  if (bytes !== undefined && decoded.length !== bytes) return null;
  return decoded;
}

/** The parts of an envelope, or null when `value` starts like one but is not a valid one. */
function parseEnvelope(value: string): ParsedEnvelope | null {
  const parts = value.split(':');
  if (parts.length !== ENVELOPE_PARTS) return null;
  const [, version, algorithm, keyId = '', nonce = '', ciphertext = '', tag = ''] = parts;
  if (`${ENVELOPE_PREFIX}${version}:${algorithm}` !== HEADER || !KEY_ID.test(keyId)) return null;
  const decoded = [
    decodePart(nonce, NONCE_BYTES),
    decodePart(ciphertext),
    decodePart(tag, TAG_BYTES),
  ];
  if (decoded.some((part) => part === null)) return null;
  const [nonceBytes, ciphertextBytes, tagBytes] = decoded as [Buffer, Buffer, Buffer];
  return { keyId, nonce: nonceBytes, ciphertext: ciphertextBytes, tag: tagBytes };
}

export function isEnvelope(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}

/** The keys a process can open secrets with: the current one, and the previous one while rotating. */
export type SecretsKeyring = { current: SecretsKey | null; previous: SecretsKey | null };

/**
 * What a stored value is, judged without decrypting it: not encrypted, sealed with the current or
 * the previous key, sealed with a key that is not configured, or damaged (it starts like an
 * envelope but is not a valid one).
 */
export type SecretState = 'unencrypted' | 'current' | 'previous' | 'unknownKey' | 'malformed';

export function classifySecret(value: string, keyring: SecretsKeyring): SecretState {
  if (!isEnvelope(value)) return 'unencrypted';
  const envelope = parseEnvelope(value);
  if (!envelope) return 'malformed';
  if (keyring.current?.id === envelope.keyId) return 'current';
  if (keyring.previous?.id === envelope.keyId) return 'previous';
  return 'unknownKey';
}

/** The key id an envelope names, or null for an unencrypted or damaged value. */
export function envelopeKeyId(value: string): string | null {
  return isEnvelope(value) ? (parseEnvelope(value)?.keyId ?? null) : null;
}

export type UnreadableReason = 'unknownKey' | 'malformed' | 'authentication';

/** A stored secret that cannot be opened. Its message names the reason, never the value. */
export class SecretUnreadableError extends Error {
  constructor(
    readonly reason: UnreadableReason,
    readonly place: SecretPlace,
    readonly keyId: string | null,
  ) {
    super(
      `The ${place.table}.${place.column} value of user ${place.ownerId} cannot be opened: ${REASON_TEXT[reason]}.`,
    );
    this.name = 'SecretUnreadableError';
  }
}

const REASON_TEXT: Record<UnreadableReason, string> = {
  unknownKey: 'it was encrypted with a key that is not configured',
  malformed: 'it is not a valid encrypted value',
  authentication: 'it was changed, moved from another row, or the key is wrong',
};

export type OpenedSecret = { value: string; state: 'unencrypted' | 'current' | 'previous' };

/**
 * Opens a stored value. An unencrypted value is returned as it is, with its state, so callers can
 * encrypt it; anything that cannot be opened throws `SecretUnreadableError`.
 */
export function openSecret(
  value: string,
  place: SecretPlace,
  keyring: SecretsKeyring,
): OpenedSecret {
  if (!isEnvelope(value)) return { value, state: 'unencrypted' };
  const envelope = parseEnvelope(value);
  if (!envelope) throw new SecretUnreadableError('malformed', place, null);
  const key = [keyring.current, keyring.previous].find((k) => k?.id === envelope.keyId);
  if (!key) throw new SecretUnreadableError('unknownKey', place, envelope.keyId);
  try {
    const opened = key.open(envelope, place);
    return { value: opened, state: key === keyring.current ? 'current' : 'previous' };
  } catch {
    throw new SecretUnreadableError('authentication', place, envelope.keyId);
  }
}

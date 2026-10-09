import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { S3Connection } from '../config';
import type { DocumentStore } from './documentStore';
import { deleteObjectsInBatches } from './s3Deletes';

// The optional S3 document store (QRO_DOCUMENT_STORAGE=s3), and the source that
// `quro documents migrate-from-s3` reads from. Any S3-compatible service works.

const S3_CHECK_TIMEOUT_MS = 2_000;
// Every stored document is a PDF (lib/pdfDocuments.ts).
const DOCUMENT_CONTENT_TYPE = 'application/pdf';

/** The part of the SDK client the store uses; tests pass a fake. */
export type S3CommandSender = Pick<S3Client, 'send'>;

export function createS3Client(connection: S3Connection): S3Client {
  return new S3Client({
    endpoint: connection.endpoint,
    region: connection.region,
    credentials: {
      accessKeyId: connection.accessKeyId,
      secretAccessKey: connection.secretAccessKey.reveal(),
    },
    forcePathStyle: connection.forcePathStyle,
  });
}

async function readableToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (typeof body === 'object' && body !== null && 'transformToByteArray' in body) {
    const transformable = body as { transformToByteArray: () => Promise<Uint8Array> };
    return Buffer.from(await transformable.transformToByteArray());
  }
  return readableToBuffer(body as Readable);
}

export function isS3NotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { name?: unknown; Code?: unknown; code?: unknown };
  const values = [maybeError.name, maybeError.Code, maybeError.code].map((value) =>
    String(value ?? ''),
  );
  return values.includes('NoSuchKey') || values.includes('NotFound');
}

export function createS3DocumentStore(
  connection: S3Connection,
  client: S3CommandSender = createS3Client(connection),
): DocumentStore {
  const Bucket = connection.bucket;

  return {
    driver: 's3',

    async put(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentType: DOCUMENT_CONTENT_TYPE,
          ContentLength: body.byteLength,
          ServerSideEncryption: 'AES256',
        }),
      );
    },

    async get(key) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return response.Body ? await bodyToBuffer(response.Body) : null;
      } catch (error) {
        if (isS3NotFoundError(error)) return null;
        throw error;
      }
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    deleteMany(keys) {
      return deleteObjectsInBatches(keys, async (batch) => {
        const result = await client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        const errors = result.Errors ?? [];
        if (errors.length) console.error('Some S3 objects could not be deleted', errors);
        // An error without a key cannot safely be attributed to one object.
        if (errors.some((error) => !error.Key)) return batch;
        return errors.map((error) => error.Key!);
      });
    },

    async check() {
      await client.send(new HeadBucketCommand({ Bucket }), {
        abortSignal: AbortSignal.timeout(S3_CHECK_TIMEOUT_MS),
      });
    },
  };
}

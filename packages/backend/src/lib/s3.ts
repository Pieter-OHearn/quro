import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { getConfig } from '../config';
import { deleteObjectsInBatches, type ObjectDeletionResult } from './s3Deletes';

export class S3ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'S3ConfigurationError';
  }
}

// The settings are validated at startup (src/config); an unconfigured store only fails here, when
// something actually tries to use it.
function loadS3Config() {
  const { documents } = getConfig();
  if (!documents.enabled) {
    throw new S3ConfigurationError('S3 document storage is not configured');
  }
  return documents;
}

let cachedClient: S3Client | null = null;
let cachedClientFor: ReturnType<typeof loadS3Config> | null = null;

function getS3Client(): S3Client {
  const config = loadS3Config();
  if (cachedClient && cachedClientFor === config) return cachedClient;

  cachedClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey.reveal(),
    },
    forcePathStyle: config.forcePathStyle,
  });
  cachedClientFor = config;

  return cachedClient;
}

async function readableToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of readable) {
    if (chunk instanceof Uint8Array) {
      chunks.push(chunk);
      continue;
    }

    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function getS3BucketName(): string {
  return loadS3Config().bucket;
}

export async function checkS3Readiness(): Promise<void> {
  const client = getS3Client();
  await client.send(
    new HeadBucketCommand({
      Bucket: getS3BucketName(),
    }),
    {
      abortSignal: AbortSignal.timeout(2_000),
    },
  );
}

export async function uploadS3Object(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: getS3BucketName(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ContentLength: params.body.byteLength,
      ServerSideEncryption: 'AES256',
    }),
  );
}

export async function getS3ObjectBytes(params: { key: string }): Promise<Buffer | null> {
  const client = getS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: getS3BucketName(),
      Key: params.key,
    }),
  );

  if (!response.Body) return null;

  const body = response.Body as unknown;
  if (typeof body === 'object' && body !== null && 'transformToByteArray' in body) {
    const transformable = body as { transformToByteArray: () => Promise<Uint8Array> };
    return Buffer.from(await transformable.transformToByteArray());
  }

  return readableToBuffer(response.Body as Readable);
}

export async function deleteS3Object(params: { key: string }): Promise<void> {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getS3BucketName(),
      Key: params.key,
    }),
  );
}

export function deleteS3Objects(keys: readonly string[]): Promise<ObjectDeletionResult> {
  return deleteObjectsInBatches(keys, async (batch) => {
    const result = await getS3Client().send(
      new DeleteObjectsCommand({
        Bucket: getS3BucketName(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    const errors = result.Errors ?? [];
    if (errors.length) console.error('Some S3 objects could not be deleted', errors);
    // An error without a key cannot safely be attributed to one object.
    if (errors.some((error) => !error.Key)) return batch;
    return errors.map((error) => error.Key!);
  });
}

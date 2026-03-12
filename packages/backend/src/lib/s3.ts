import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

const REQUIRED_ENV_KEYS = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

let cachedConfig: S3Config | null = null;
let cachedClient: S3Client | null = null;

export class S3ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'S3ConfigurationError';
  }
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function loadS3Config(): S3Config {
  if (cachedConfig) return cachedConfig;

  const missing = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new S3ConfigurationError(
      `Missing required S3 environment variables: ${missing.join(', ')}`,
    );
  }

  cachedConfig = {
    endpoint: process.env.S3_ENDPOINT!.trim(),
    region: process.env.S3_REGION!.trim(),
    bucket: process.env.S3_BUCKET!.trim(),
    accessKeyId: process.env.S3_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!.trim(),
    forcePathStyle: parseBooleanEnv(process.env.S3_FORCE_PATH_STYLE, true),
  };

  return cachedConfig;
}

function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  const config = loadS3Config();

  cachedClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });

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

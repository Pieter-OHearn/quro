import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Secret, type S3Connection } from '../config';
import type { S3CommandSender } from '../lib/s3';

/** Synthetic connection settings; nothing listens at the endpoint. */
export const FAKE_S3_CONNECTION: S3Connection = {
  endpoint: 'http://s3.test.invalid:9000',
  region: 'test-region',
  bucket: 'quro-test-documents',
  accessKeyId: 'test-access-key',
  secretAccessKey: new Secret('test-secret-key'),
  forcePathStyle: true,
};

function s3Error(name: string): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } });
}

/**
 * An in-memory S3 bucket behind the SDK's `send`, for the S3 driver and the migration command.
 * It records every command, and `failGet` lets a test break a download the way a network fault
 * or an interrupted run would.
 */
export class FakeS3Client {
  readonly objects = new Map<string, Uint8Array>();
  readonly commands: string[] = [];
  readonly gets: string[] = [];
  /** Return an error to make the download of that key fail. */
  failGet: (key: string) => Error | undefined = () => undefined;
  /** Keys DeleteObjects reports as failed. */
  readonly failedDeletes = new Set<string>();
  bucketReachable = true;

  constructor(readonly bucket = FAKE_S3_CONNECTION.bucket) {}

  private assertBucket(bucket: unknown) {
    if (bucket !== this.bucket) throw s3Error('NoSuchBucket');
  }

  send(command: unknown): Promise<unknown> {
    try {
      return Promise.resolve(this.handle(command));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private handle(command: unknown): unknown {
    if (command instanceof PutObjectCommand) return this.putObject(command);
    if (command instanceof GetObjectCommand) return this.getObject(command);
    if (command instanceof DeleteObjectCommand) return this.deleteObject(command);
    if (command instanceof DeleteObjectsCommand) return this.deleteObjects(command);
    if (command instanceof HeadBucketCommand) return this.headBucket(command);
    throw new Error('The fake S3 client does not support this command');
  }

  private putObject(command: PutObjectCommand) {
    this.commands.push('PutObject');
    this.assertBucket(command.input.Bucket);
    this.objects.set(command.input.Key!, new Uint8Array(command.input.Body as Uint8Array));
    return {};
  }

  private getObject(command: GetObjectCommand) {
    this.commands.push('GetObject');
    this.assertBucket(command.input.Bucket);
    const key = command.input.Key!;
    this.gets.push(key);
    const fault = this.failGet(key);
    if (fault) throw fault;
    const stored = this.objects.get(key);
    if (!stored) throw s3Error('NoSuchKey');
    const copy = new Uint8Array(stored);
    return { Body: { transformToByteArray: () => Promise.resolve(copy) } };
  }

  private deleteObject(command: DeleteObjectCommand) {
    this.commands.push('DeleteObject');
    this.assertBucket(command.input.Bucket);
    this.objects.delete(command.input.Key!);
    return {};
  }

  private deleteObjects(command: DeleteObjectsCommand) {
    this.commands.push('DeleteObjects');
    this.assertBucket(command.input.Bucket);
    const keys = (command.input.Delete?.Objects ?? []).map((object) => object.Key!);
    const errors = keys
      .filter((key) => this.failedDeletes.has(key))
      .map((Key) => ({ Key, Code: 'InternalError' }));
    for (const key of keys) if (!this.failedDeletes.has(key)) this.objects.delete(key);
    return { Errors: errors.length > 0 ? errors : undefined };
  }

  private headBucket(command: HeadBucketCommand) {
    this.commands.push('HeadBucket');
    if (!this.bucketReachable) throw Object.assign(new Error('offline'), { code: 'ECONNREFUSED' });
    this.assertBucket(command.input.Bucket);
    return {};
  }

  asSender(): S3CommandSender {
    return this as unknown as S3CommandSender;
  }
}

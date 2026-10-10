import { createHash } from 'node:crypto';

// Anonymous pull check for the published core images.
//
// Reads each image the way a first-time operator's `docker pull` does, with no registry
// account: it asks the registry for a pull token without credentials, reads the image index
// and the manifest of every required platform, and then checks that every config and layer
// blob of those manifests can be read. It never logs in, never writes and never changes
// package visibility. Visibility is a property of the whole package on GHCR, not of a tag,
// so a package that turned private (or never was public) fails here whatever tag is asked for.
//
//   bun scripts/lib/image-access.ts --tag v0.7.0
//   bun scripts/lib/image-access.ts --tag latest --full
//   bun scripts/lib/image-access.ts --tag sha-<commit> --expect quro-backend=sha256:<digest>
//
// Exit codes: 0 every check passed, 1 an image is not readable anonymously, 2 bad arguments.

export const REGISTRY_HOST = 'ghcr.io';
export const DEFAULT_OWNER = 'pieter-ohearn';
export const DEFAULT_IMAGES: readonly string[] = ['quro-backend', 'quro-frontend'];
export const DEFAULT_PLATFORMS: readonly string[] = ['linux/amd64', 'linux/arm64'];

const OWNER_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}$/;
const IMAGE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const TAG_PATTERN = /^[\w][\w.-]{0,127}$/;
const PLATFORM_PATTERN = /^(linux)\/(amd64|arm64)$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ATTESTATION_ANNOTATION = 'vnd.docker.reference.type';
const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');
const HTTP_PARTIAL = 206;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 399;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;
const MAX_REDIRECTS = 3;
const DEFAULT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const BLOB_CONCURRENCY = 4;
const EXIT_DENIED = 1;
const EXIT_USAGE = 2;
const CLI_ARGS_START = 2;

export class ImageAccessError extends Error {}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type Http = {
  fetch: Fetch;
  sleep: (milliseconds: number) => Promise<void>;
  attempts: number;
};

export type Descriptor = {
  mediaType?: string;
  digest: string;
  size: number;
  platform?: { os?: string; architecture?: string };
  annotations?: Record<string, string>;
};

type Manifest = {
  mediaType?: string;
  manifests?: Descriptor[];
  config?: Descriptor;
  layers?: Descriptor[];
};

type Fetched = { digest: string; manifest: Manifest };

export type PlatformReport = {
  platform: string;
  manifestDigest: string;
  blobs: number;
  bytes: number;
};

export type ImageReport = {
  image: string;
  reference: string;
  indexDigest: string;
  platforms: PlatformReport[];
  problems: string[];
};

export type CheckOptions = {
  owner: string;
  images: readonly string[];
  tag: string;
  platforms: readonly string[];
  expectedDigests: Readonly<Record<string, string>>;
  // Download and hash every blob instead of reading its first byte and checking its size.
  full: boolean;
};

export function defaultHttp(): Http {
  return {
    fetch: (input, init) => fetch(input, init),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    attempts: DEFAULT_ATTEMPTS,
  };
}

function isTransient(status: number): boolean {
  return status === HTTP_TOO_MANY || status >= HTTP_SERVER_ERROR;
}

// Retries network errors and 429/5xx answers. 401, 403 and 404 are answers, not outages.
async function request(
  http: Http,
  what: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let reason = 'no attempt was made';
  for (let attempt = 1; attempt <= http.attempts; attempt += 1) {
    if (attempt > 1) await http.sleep(RETRY_DELAY_MS);
    try {
      const response = await http.fetch(url, { ...init, redirect: 'manual' });
      if (!isTransient(response.status)) return response;
      await response.body?.cancel();
      reason = `HTTP ${response.status}`;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
  }
  throw new ImageAccessError(
    `${what}: registry unreachable after ${http.attempts} attempts (${reason})`,
  );
}

async function anonymousToken(http: Http, repository: string): Promise<string> {
  const what = `${repository}: pull token`;
  const scope = encodeURIComponent(`repository:${repository}:pull`);
  const url = `https://${REGISTRY_HOST}/token?service=${REGISTRY_HOST}&scope=${scope}`;
  const response = await request(http, what, url);
  let token: unknown;
  try {
    token = ((await response.json()) as { token?: unknown }).token;
  } catch {
    token = undefined;
  }
  if (response.ok && typeof token === 'string' && token) {
    return token;
  }
  throw new ImageAccessError(
    `${repository}: the registry refused an anonymous pull token (HTTP ${response.status}). ` +
      'The package is private or does not exist; the core images must be public.',
  );
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isDescriptor(value: unknown): value is Descriptor {
  const candidate = value as Descriptor | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.digest === 'string' &&
    DIGEST_PATTERN.test(candidate.digest) &&
    Number.isSafeInteger(candidate.size) &&
    candidate.size > 0
  );
}

function parseManifest(text: string, what: string): Manifest {
  let parsed: Manifest;
  try {
    parsed = JSON.parse(text) as Manifest;
  } catch {
    throw new ImageAccessError(`${what}: the registry returned a manifest that is not JSON`);
  }
  const lists = [parsed.manifests, parsed.layers].filter((list) => list !== undefined);
  const descriptors = [...lists.flat(), ...(parsed.config === undefined ? [] : [parsed.config])];
  if (descriptors.length === 0 || !descriptors.every(isDescriptor)) {
    throw new ImageAccessError(`${what}: the manifest has no valid index entries or layers`);
  }
  return parsed;
}

function refusal(what: string, status: number): ImageAccessError {
  if (status === HTTP_NOT_FOUND) {
    return new ImageAccessError(
      `${what}: not found (HTTP 404, manifest unknown). It was never published or has been deleted.`,
    );
  }
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
    return new ImageAccessError(
      `${what}: access denied without credentials (HTTP ${status}). The package is private.`,
    );
  }
  return new ImageAccessError(`${what}: unexpected registry answer HTTP ${status}`);
}

async function fetchManifest(
  http: Http,
  token: string,
  repository: string,
  reference: string,
  what: string,
): Promise<Fetched> {
  const url = `https://${REGISTRY_HOST}/v2/${repository}/manifests/${reference}`;
  const response = await request(http, what, url, {
    headers: { Authorization: `Bearer ${token}`, Accept: MANIFEST_ACCEPT },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw refusal(what, response.status);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = sha256(bytes);
  const announced = response.headers.get('docker-content-digest');
  if (DIGEST_PATTERN.test(reference) && digest !== reference) {
    throw new ImageAccessError(`${what}: the manifest hashes to ${digest}, not ${reference}`);
  }
  if (announced !== null && announced !== digest) {
    throw new ImageAccessError(`${what}: the manifest hashes to ${digest}, not ${announced}`);
  }
  return { digest, manifest: parseManifest(new TextDecoder().decode(bytes), what) };
}

function platformEntry(index: Manifest, platform: string): Descriptor | undefined {
  const [os, architecture] = platform.split('/');
  return index.manifests?.find(
    (entry) =>
      entry.platform?.os === os &&
      entry.platform.architecture === architecture &&
      entry.annotations?.[ATTESTATION_ANNOTATION] === undefined,
  );
}

// Follows redirects by hand so the bearer token goes to the registry only, never to the
// storage host a blob redirects to.
async function openBlob(
  http: Http,
  token: string,
  repository: string,
  blob: Descriptor,
  range: boolean,
): Promise<Response> {
  const what = `${repository} blob ${blob.digest}`;
  let url = `https://${REGISTRY_HOST}/v2/${repository}/blobs/${blob.digest}`;
  let sendToken = true;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const headers: Record<string, string> = range ? { Range: 'bytes=0-0' } : {};
    if (sendToken) headers.Authorization = `Bearer ${token}`;
    const response = await request(http, what, url, { headers });
    const location = response.headers.get('location');
    if (response.status < HTTP_REDIRECT_MIN || response.status > HTTP_REDIRECT_MAX || !location) {
      return response;
    }
    await response.body?.cancel();
    url = new URL(location, url).toString();
    sendToken = false;
  }
  throw new ImageAccessError(`${what}: too many redirects`);
}

async function hashBody(response: Response): Promise<{ digest: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }
  return { digest: `sha256:${hash.digest('hex')}`, bytes };
}

function rangedSize(response: Response): number | null {
  if (response.status === HTTP_PARTIAL) {
    const total = /^bytes 0-0\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
    return total ? Number(total[1]) : null;
  }
  const length = response.headers.get('content-length');
  return length === null ? null : Number(length);
}

async function checkBlob(
  http: Http,
  token: string,
  repository: string,
  blob: Descriptor,
  full: boolean,
): Promise<void> {
  const what = `${repository} blob ${blob.digest}`;
  const response = await openBlob(http, token, repository, blob, !full);
  if (!response.ok) {
    await response.body?.cancel();
    throw new ImageAccessError(`${what}: layer not readable anonymously (HTTP ${response.status})`);
  }
  if (!full) {
    await response.body?.cancel();
    const size = rangedSize(response);
    if (size !== blob.size) {
      throw new ImageAccessError(
        `${what}: registry reports ${size} bytes, manifest says ${blob.size}`,
      );
    }
    return;
  }
  const actual = await hashBody(response);
  if (actual.digest !== blob.digest || actual.bytes !== blob.size) {
    throw new ImageAccessError(
      `${what}: downloaded ${actual.bytes} bytes hashing to ${actual.digest}`,
    );
  }
}

async function runLimited<T>(
  items: readonly T[],
  work: (item: T) => Promise<void>,
): Promise<string[]> {
  const problems: string[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      try {
        await work(item);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BLOB_CONCURRENCY, items.length) }, worker));
  return problems;
}

async function checkPlatform(
  http: Http,
  token: string,
  repository: string,
  entry: Descriptor,
  platform: string,
  full: boolean,
): Promise<{ report: PlatformReport; problems: string[] }> {
  const what = `${repository} ${platform} manifest`;
  const { manifest } = await fetchManifest(http, token, repository, entry.digest, what);
  const blobs = [...(manifest.config ? [manifest.config] : []), ...(manifest.layers ?? [])];
  const problems = await runLimited(blobs, (blob) =>
    checkBlob(http, token, repository, blob, full),
  );
  const bytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
  return {
    report: { platform, manifestDigest: entry.digest, blobs: blobs.length, bytes },
    problems,
  };
}

export async function checkImage(
  http: Http,
  options: CheckOptions,
  image: string,
): Promise<ImageReport> {
  const repository = `${options.owner}/${image}`;
  const reference = `${image}:${options.tag}`;
  const report: ImageReport = { image, reference, indexDigest: '', platforms: [], problems: [] };
  try {
    const token = await anonymousToken(http, repository);
    const index = await fetchManifest(http, token, repository, options.tag, `${reference} tag`);
    report.indexDigest = index.digest;
    const expected = options.expectedDigests[image];
    if (expected !== undefined && expected !== index.digest) {
      report.problems.push(`${reference}: resolves to ${index.digest}, expected ${expected}`);
    }
    for (const platform of options.platforms) {
      const entry = platformEntry(index.manifest, platform);
      if (!entry) {
        report.problems.push(`${reference}: no ${platform} image in the manifest list`);
        continue;
      }
      const result = await checkPlatform(http, token, repository, entry, platform, options.full);
      report.platforms.push(result.report);
      report.problems.push(...result.problems);
    }
  } catch (error) {
    if (!(error instanceof ImageAccessError)) throw error;
    report.problems.push(error.message);
  }
  return report;
}

export async function checkImages(http: Http, options: CheckOptions): Promise<ImageReport[]> {
  const reports: ImageReport[] = [];
  for (const image of options.images) reports.push(await checkImage(http, options, image));
  return reports;
}

// ── Command line ─────────────────────────────────────────────────────────────

export class UsageError extends Error {}

const USAGE =
  'Usage: image-access.ts --tag <tag> [--owner <name>] [--image <name>]... ' +
  '[--platform linux/amd64|linux/arm64]... [--expect <image>=sha256:<digest>]... [--full]';

type Pending = { owner: string; images: string[]; platforms: string[]; expected: string[] };

function takeValue(args: readonly string[], index: number): string {
  const value = args[index + 1];
  if (value === undefined) throw new UsageError(`${args[index]} needs a value`);
  return value;
}

function parseExpectations(entries: readonly string[], images: readonly string[]) {
  const digests: Record<string, string> = {};
  for (const entry of entries) {
    const [image, digest] = entry.split('=');
    if (!images.includes(image) || !DIGEST_PATTERN.test(digest ?? '')) {
      throw new UsageError(`--expect needs <image>=sha256:<64 hex digits> for a checked image`);
    }
    digests[image] = digest;
  }
  return digests;
}

export function parseArgs(args: readonly string[]): CheckOptions {
  const pending: Pending = { owner: DEFAULT_OWNER, images: [], platforms: [], expected: [] };
  let tag = '';
  let full = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--full') full = true;
    else if (flag === '--tag') tag = takeValue(args, index++);
    else if (flag === '--owner') pending.owner = takeValue(args, index++);
    else if (flag === '--image') pending.images.push(takeValue(args, index++));
    else if (flag === '--platform') pending.platforms.push(takeValue(args, index++));
    else if (flag === '--expect') pending.expected.push(takeValue(args, index++));
    else throw new UsageError(`unknown argument ${JSON.stringify(flag)}`);
  }
  const images = pending.images.length > 0 ? pending.images : [...DEFAULT_IMAGES];
  const platforms = pending.platforms.length > 0 ? pending.platforms : [...DEFAULT_PLATFORMS];
  if (!TAG_PATTERN.test(tag)) throw new UsageError('--tag is required and must be a valid tag');
  if (!OWNER_PATTERN.test(pending.owner)) throw new UsageError('--owner is not a valid name');
  if (!images.every((image) => IMAGE_PATTERN.test(image))) {
    throw new UsageError('--image is not a valid image name');
  }
  if (!platforms.every((platform) => PLATFORM_PATTERN.test(platform))) {
    throw new UsageError('--platform must be linux/amd64 or linux/arm64');
  }
  const expectedDigests = parseExpectations(pending.expected, images);
  return { owner: pending.owner, images, tag, platforms, expectedDigests, full };
}

export function formatReport(report: ImageReport, full: boolean): string[] {
  const lines = [`${report.reference} ${report.indexDigest || '(not read)'}`];
  const verb = full ? 'downloaded and hashed' : 'readable, size matches the manifest';
  for (const platform of report.platforms) {
    const megabytes = (platform.bytes / (1000 * 1000)).toFixed(1);
    lines.push(
      `  ${platform.platform} ${platform.manifestDigest}: ${platform.blobs} blobs, ${megabytes} MB, ${verb}`,
    );
  }
  for (const problem of report.problems) lines.push(`  FAIL ${problem}`);
  return lines;
}

async function main(): Promise<number> {
  let options: CheckOptions;
  try {
    options = parseArgs(process.argv.slice(CLI_ARGS_START));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${error.message}\n${USAGE}`);
    return EXIT_USAGE;
  }
  const reports = await checkImages(defaultHttp(), options);
  for (const report of reports) console.log(formatReport(report, options.full).join('\n'));
  const failed = reports.filter((report) => report.problems.length > 0);
  if (failed.length > 0) {
    console.error(
      `Anonymous image access check failed for ${failed.map((report) => report.reference).join(', ')}`,
    );
    return EXIT_DENIED;
  }
  console.log('Anonymous image access check passed');
  return 0;
}

if (import.meta.main) process.exit(await main());

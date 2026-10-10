import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_IMAGES,
  DEFAULT_PLATFORMS,
  checkImage,
  checkImages,
  formatReport,
  parseArgs,
  UsageError,
  type CheckOptions,
  type Fetch,
  type Http,
} from './image-access';

const OWNER = 'example-owner';
const STORAGE_HOST = 'storage.example.test';

function digestOf(data: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}

type FakeBlob = { digest: string; size: number; data: Uint8Array<ArrayBuffer> };

function blob(text: string): FakeBlob {
  const data = new TextEncoder().encode(text);
  return { digest: digestOf(data), size: data.byteLength, data };
}

type Behaviour = {
  tokenStatus?: number;
  manifestStatus?: number;
  blobStatus?: number;
  // Serve a different body than the blob's digest, as a corrupted store would.
  corruptBlobs?: boolean;
  // Report a wrong total in Content-Range.
  wrongRangeTotal?: boolean;
  omitArm64?: boolean;
  // Redirect blobs to a plain http URL.
  insecureRedirect?: boolean;
  // List the platform manifests with a wrong size in the index.
  wrongIndexSize?: boolean;
  failFirstManifestWith?: number;
};

type Request = { url: string; authorization: string | null; range: string | null };

function buildRegistry(image: string, tag: string, behaviour: Behaviour = {}) {
  const platforms = behaviour.omitArm64 ? ['amd64'] : ['amd64', 'arm64'];
  const blobs = new Map<string, FakeBlob>();
  const manifests = new Map<string, string>();
  const entries: unknown[] = [];
  for (const architecture of platforms) {
    const config = blob(`config ${image} ${architecture}`);
    const layerA = blob(`layer one ${image} ${architecture}`);
    const layerB = blob(`layer two ${image} ${architecture}`);
    for (const item of [config, layerA, layerB]) blobs.set(item.digest, item);
    const body = JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: 'application/vnd.oci.image.config.v1+json', ...strip(config) },
      layers: [layerA, layerB].map((layer) => ({
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        ...strip(layer),
      })),
    });
    manifests.set(digestOf(body), body);
    entries.push({
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: digestOf(body),
      size: behaviour.wrongIndexSize ? body.length + 1 : body.length,
      platform: { os: 'linux', architecture },
    });
    // Attestation manifests are listed with an unknown platform and must be ignored.
    entries.push({
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      digest: digestOf(`attestation ${architecture}`),
      size: 837,
      annotations: { 'vnd.docker.reference.type': 'attestation-manifest' },
      platform: { os: 'unknown', architecture: 'unknown' },
    });
  }
  const index = JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests: entries,
  });
  manifests.set(digestOf(index), index);
  manifests.set(tag, index);
  return { blobs, manifests, indexDigest: digestOf(index) };
}

function strip(item: FakeBlob): { digest: string; size: number } {
  return { digest: item.digest, size: item.size };
}

function fakeHttp(image: string, tag: string, behaviour: Behaviour = {}) {
  const registry = buildRegistry(image, tag, behaviour);
  const requests: Request[] = [];
  let manifestCalls = 0;
  const fetchFake: Fetch = (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    requests.push({
      url: url.toString(),
      authorization: headers.get('authorization'),
      range: headers.get('range'),
    });
    return Promise.resolve(answer(url, headers));
  };

  function answer(url: URL, headers: Headers): Response {
    if (url.host === 'ghcr.io' && url.pathname === '/token') {
      const status = behaviour.tokenStatus ?? 200;
      if (status !== 200) {
        return Response.json({ errors: [{ code: 'DENIED' }] }, { status });
      }
      return Response.json({ token: 'anonymous-test-token' });
    }
    if (url.host === STORAGE_HOST) return serveBlob(url, headers);
    if (headers.get('authorization') !== 'Bearer anonymous-test-token') {
      return Response.json({ errors: [{ code: 'UNAUTHORIZED' }] }, { status: 401 });
    }
    const manifest = /^\/v2\/[^/]+\/[^/]+\/manifests\/(.+)$/.exec(url.pathname);
    if (manifest) return answerManifest(manifest[1]);
    if (/^\/v2\/[^/]+\/[^/]+\/blobs\//.test(url.pathname)) return answerBlobRedirect(url);
    return new Response('', { status: 404 });
  }

  function answerManifest(reference: string): Response {
    manifestCalls += 1;
    if (behaviour.failFirstManifestWith && manifestCalls === 1) {
      return new Response('unavailable', { status: behaviour.failFirstManifestWith });
    }
    const body = registry.manifests.get(reference);
    if (behaviour.manifestStatus !== undefined || body === undefined) {
      const status = behaviour.manifestStatus ?? 404;
      return Response.json({ errors: [{ code: 'MANIFEST_UNKNOWN' }] }, { status });
    }
    return new Response(body, { headers: { 'docker-content-digest': digestOf(body) } });
  }

  function answerBlobRedirect(url: URL): Response {
    if (behaviour.blobStatus !== undefined)
      return new Response('', { status: behaviour.blobStatus });
    const scheme = behaviour.insecureRedirect ? 'http' : 'https';
    const target = `${scheme}://${STORAGE_HOST}/blob/${url.pathname.split('/').pop()}`;
    return new Response(null, { status: 307, headers: { location: target } });
  }

  function serveBlob(url: URL, headers: Headers): Response {
    const found = registry.blobs.get(url.pathname.split('/').pop() ?? '');
    if (!found) return new Response('', { status: 404 });
    const data = behaviour.corruptBlobs ? new TextEncoder().encode('corrupted') : found.data;
    if (headers.get('range') === 'bytes=0-0') {
      const total = behaviour.wrongRangeTotal ? found.size + 1 : found.size;
      return new Response(data.slice(0, 1), {
        status: 206,
        headers: { 'content-range': `bytes 0-0/${total}` },
      });
    }
    return new Response(data, { headers: { 'content-length': String(data.byteLength) } });
  }

  const sleeps: number[] = [];
  const http: Http = {
    fetch: fetchFake,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
    attempts: 3,
  };
  return { http, requests, sleeps, indexDigest: registry.indexDigest };
}

function options(overrides: Partial<CheckOptions> = {}): CheckOptions {
  return {
    owner: OWNER,
    images: ['quro-backend'],
    tag: 'v1.2.3',
    platforms: ['linux/amd64', 'linux/arm64'],
    expectedDigests: {},
    full: false,
    ...overrides,
  };
}

describe('checkImage', () => {
  test('passes when the tag, both platforms and every blob are readable without credentials', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3');
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.problems).toEqual([]);
    expect(report.indexDigest).toBe(fake.indexDigest);
    expect(report.platforms.map((entry) => entry.platform)).toEqual(['linux/amd64', 'linux/arm64']);
    // One config and two layers per platform.
    expect(report.platforms.map((entry) => entry.blobs)).toEqual([3, 3]);
    expect(fake.requests[0].url).toStartWith('https://ghcr.io/token?');
    expect(fake.requests[0].authorization).toBeNull();
  });

  test('sends the token to the registry only, never to the storage host it redirects to', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3');
    await checkImage(fake.http, options(), 'quro-backend');
    const storage = fake.requests.filter((entry) => new URL(entry.url).host === STORAGE_HOST);
    expect(storage.length).toBe(6);
    for (const entry of storage) expect(entry.authorization).toBeNull();
    const registry = fake.requests.filter((entry) => new URL(entry.url).host === 'ghcr.io');
    for (const entry of registry.slice(1))
      expect(entry.authorization).toBe('Bearer anonymous-test-token');
  });

  test('reads one byte of each blob unless asked to download it', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3');
    await checkImage(fake.http, options(), 'quro-backend');
    const storage = fake.requests.filter((entry) => new URL(entry.url).host === STORAGE_HOST);
    for (const entry of storage) expect(entry.range).toBe('bytes=0-0');
  });

  test('downloads and hashes every blob with full', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3');
    const report = await checkImage(fake.http, options({ full: true }), 'quro-backend');
    expect(report.problems).toEqual([]);
    expect(fake.requests.filter((entry) => entry.range !== null)).toEqual([]);
    expect(formatReport(report, true).join('\n')).toContain('downloaded and hashed');
  });

  test('fails when a downloaded blob does not hash to its digest', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { corruptBlobs: true });
    const report = await checkImage(fake.http, options({ full: true }), 'quro-backend');
    expect(report.problems.length).toBe(6);
    expect(report.problems[0]).toContain('downloaded 9 bytes hashing to');
  });

  test('fails clearly when the tag does not exist', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3');
    const report = await checkImage(fake.http, options({ tag: 'v9.9.9' }), 'quro-backend');
    expect(report.indexDigest).toBe('');
    expect(report.problems).toEqual([
      'quro-backend:v9.9.9 tag: not found (HTTP 404, manifest unknown). It was never published or has been deleted.',
    ]);
  });

  test('fails clearly when the registry refuses an anonymous token', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { tokenStatus: 403 });
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain('refused an anonymous pull token (HTTP 403)');
    expect(report.problems[0]).toContain('private or does not exist');
    // No manifest or blob request follows a refused token.
    expect(fake.requests).toHaveLength(1);
  });

  test('fails clearly when the manifest needs credentials', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { manifestStatus: 401 });
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.problems[0]).toContain('access denied without credentials (HTTP 401)');
    expect(report.problems[0]).toContain('The package is private');
  });

  test('fails when a layer cannot be read anonymously', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { blobStatus: 403 });
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.problems.length).toBe(6);
    expect(report.problems[0]).toContain('layer not readable anonymously (HTTP 403)');
  });

  test('fails when the registry reports a different blob size than the manifest', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { wrongRangeTotal: true });
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.problems[0]).toMatch(/registry reports \d+ bytes, manifest says \d+/);
  });

  test('refuses a blob redirect to a plain http URL', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { insecureRedirect: true });
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.problems.length).toBe(6);
    expect(report.problems[0]).toContain('refusing a redirect to http://storage.example.test');
    expect(fake.requests.some((entry) => entry.url.startsWith('http://'))).toBe(false);
  });

  test('fails when a platform manifest is not the size the index lists', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { wrongIndexSize: true });
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.problems[0]).toMatch(/manifest: \d+ bytes, the manifest list says \d+/);
  });

  test('fails when a required platform is missing and ignores attestation entries', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { omitArm64: true });
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.platforms.map((entry) => entry.platform)).toEqual(['linux/amd64']);
    expect(report.problems).toEqual([
      'quro-backend:v1.2.3: no linux/arm64 image in the manifest list',
    ]);
  });

  test('checks only the platforms asked for', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { omitArm64: true });
    const report = await checkImage(
      fake.http,
      options({ platforms: ['linux/amd64'] }),
      'quro-backend',
    );
    expect(report.problems).toEqual([]);
  });

  test('fails when the tag does not resolve to the expected digest', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3');
    const wrong = `sha256:${'0'.repeat(64)}`;
    const report = await checkImage(
      fake.http,
      options({ expectedDigests: { 'quro-backend': wrong } }),
      'quro-backend',
    );
    expect(report.problems).toEqual([
      `quro-backend:v1.2.3: resolves to ${fake.indexDigest}, expected ${wrong}`,
    ]);
    const ok = await checkImage(
      fake.http,
      options({ expectedDigests: { 'quro-backend': fake.indexDigest } }),
      'quro-backend',
    );
    expect(ok.problems).toEqual([]);
  });

  test('retries a transient registry error and then succeeds', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3', { failFirstManifestWith: 503 });
    const report = await checkImage(fake.http, options(), 'quro-backend');
    expect(report.problems).toEqual([]);
    expect(fake.sleeps).toHaveLength(1);
  });

  test('reports an unreachable registry after the last attempt', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3');
    const failing: Http = {
      ...fake.http,
      fetch: () => Promise.reject(new Error('getaddrinfo ENOTFOUND ghcr.io')),
    };
    const report = await checkImage(failing, options(), 'quro-backend');
    expect(report.problems).toEqual([
      'example-owner/quro-backend: pull token: registry unreachable after 3 attempts (getaddrinfo ENOTFOUND ghcr.io)',
    ]);
    expect(fake.sleeps).toHaveLength(2);
  });

  test('does not retry a 404', async () => {
    const fake = fakeHttp('quro-backend', 'v1.2.3');
    await checkImage(fake.http, options({ tag: 'v9.9.9' }), 'quro-backend');
    expect(fake.sleeps).toEqual([]);
  });
});

describe('checkImages', () => {
  test('checks every image and keeps going after one fails', async () => {
    const backend = fakeHttp('quro-backend', 'v1.2.3');
    const reports = await checkImages(
      backend.http,
      options({ images: ['quro-backend', 'quro-frontend'] }),
    );
    expect(reports.map((report) => report.image)).toEqual(['quro-backend', 'quro-frontend']);
    // The fake registry serves manifests for whatever image name is asked, so both pass here.
    expect(reports.every((report) => report.problems.length === 0)).toBe(true);
  });
});

describe('parseArgs', () => {
  test('checks exactly the two core images, never the retired updater', () => {
    expect(DEFAULT_IMAGES).toEqual(['quro-backend', 'quro-frontend']);
    expect(DEFAULT_PLATFORMS).toEqual(['linux/amd64', 'linux/arm64']);
  });

  test('defaults to the two core images and both platforms', () => {
    expect(parseArgs(['--tag', 'v0.7.0'])).toEqual({
      owner: 'pieter-ohearn',
      images: ['quro-backend', 'quro-frontend'],
      tag: 'v0.7.0',
      platforms: ['linux/amd64', 'linux/arm64'],
      expectedDigests: {},
      full: false,
    });
  });

  test('accepts repeated flags', () => {
    const digest = `sha256:${'a'.repeat(64)}`;
    const parsed = parseArgs([
      '--tag',
      'sha-abc',
      '--owner',
      'someone',
      '--image',
      'quro-backend',
      '--platform',
      'linux/arm64',
      '--expect',
      `quro-backend=${digest}`,
      '--full',
    ]);
    expect(parsed).toEqual({
      owner: 'someone',
      images: ['quro-backend'],
      tag: 'sha-abc',
      platforms: ['linux/arm64'],
      expectedDigests: { 'quro-backend': digest },
      full: true,
    });
  });

  test.each([
    [[]],
    [['--tag']],
    [['--tag', '-bad']],
    [['--tag', 'a/b']],
    [['--tag', 'v1', '--owner', 'Bad_Owner']],
    [['--tag', 'v1', '--image', '../x']],
    [['--tag', 'v1', '--platform', 'windows/amd64']],
    [['--tag', 'v1', '--expect', 'quro-backend=sha256:short']],
    [['--tag', 'v1', '--expect', `other=sha256:${'a'.repeat(64)}`]],
    [['--tag', 'v1', '--unknown']],
  ])('rejects %j', (args) => {
    expect(() => parseArgs(args)).toThrow(UsageError);
  });
});

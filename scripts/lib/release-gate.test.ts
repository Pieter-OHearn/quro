import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CheckRun,
  type Output,
  type Release,
  type WorkflowRun,
  RELEASE_BOT_LOGIN,
  compareVersions,
  createGitHub,
  draftsToReplace,
  evaluateRequiredChecks,
  parseReleaseVersion,
  planLatest,
  planTag,
  runCommand,
} from './release-gate';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const CI_PATH = '.github/workflows/ci.yml';

let nextId = 1000;

function ciRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  nextId += 1;
  return {
    id: nextId,
    path: CI_PATH,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_sha: SHA,
    check_suite_id: nextId,
    ...overrides,
  };
}

function ciCheck(run: WorkflowRun, overrides: Partial<CheckRun> = {}): CheckRun {
  nextId += 1;
  return {
    id: nextId,
    name: 'CI',
    head_sha: run.head_sha,
    status: run.status ?? 'completed',
    conclusion: run.conclusion,
    app: { slug: 'github-actions' },
    check_suite: { id: run.check_suite_id },
    ...overrides,
  };
}

function gate(pairs: Array<[CheckRun, WorkflowRun]>, requiredChecks = ['CI']) {
  return evaluateRequiredChecks({
    sha: SHA,
    requiredChecks,
    workflowPath: CI_PATH,
    checkRuns: pairs.map(([check]) => check),
    workflowRuns: pairs.map(([, run]) => run),
  });
}

function pair(runOverrides: Partial<WorkflowRun> = {}, checkOverrides: Partial<CheckRun> = {}) {
  const run = ciRun(runOverrides);
  return [ciCheck(run, checkOverrides), run] as [CheckRun, WorkflowRun];
}

describe('parseReleaseVersion', () => {
  test.each(['v0.8.0', 'v1.0.0-rc.1', 'v10.20.30', 'v0.8.1\n', ' v1.0.0 '])('accepts %j', (raw) => {
    expect(parseReleaseVersion(raw)).toBe(raw.trim());
  });

  test.each([
    '',
    '0.8.0',
    'v0.8',
    'v01.0.0',
    'v0.8.0-beta.1',
    'v0.8.0\nv0.9.0',
    'v0.8.0; touch pwned',
    '$(touch pwned)',
    'v0.8.0`id`',
  ])('rejects %j', (raw) => {
    expect(() => parseReleaseVersion(raw)).toThrow('VERSION must look like');
  });
});

describe('evaluateRequiredChecks', () => {
  test('passes when CI succeeded in a push run on the exact commit', () => {
    const result = gate([pair()]);
    expect(result).toMatchObject({ ok: true, problems: [] });
    expect(result.notes.join('\n')).toContain(`CI passed on ${SHA}`);
  });

  test('passes when CI succeeded in a manually dispatched run on the exact commit', () => {
    expect(gate([pair({ event: 'workflow_dispatch' })]).ok).toBe(true);
  });

  test.each(['failure', 'cancelled', 'skipped', 'timed_out'])(
    'refuses a %s CI check',
    (conclusion) => {
      const result = gate([pair({ conclusion })]);
      expect(result.ok).toBe(false);
      expect(result.problems[0]).toContain(`CI concluded ${conclusion}`);
    },
  );

  test.each(['queued', 'in_progress'])('refuses while CI is %s', (status) => {
    const result = gate([pair({ status, conclusion: null })]);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain(`CI is still ${status}`);
  });

  test('refuses while the workflow run is still in progress after a completed check', () => {
    const result = gate([
      pair(
        { status: 'in_progress', conclusion: null },
        { status: 'completed', conclusion: 'success' },
      ),
    ]);
    expect(result.problems[0]).toContain('CI is still in_progress');
  });

  test('refuses while a CI run on the commit has not reported the check yet', () => {
    const running = (event: string) =>
      evaluateRequiredChecks({
        sha: SHA,
        requiredChecks: ['CI'],
        workflowPath: CI_PATH,
        checkRuns: [],
        workflowRuns: [ciRun({ event, status: 'in_progress', conclusion: null })],
      });
    expect(running('workflow_dispatch').problems[0]).toContain('CI has not reported yet');
    expect(running('workflow_dispatch').problems[0]).toContain('is still in_progress');
    expect(running('pull_request').problems[0]).toContain('No CI check');
  });

  test('refuses a check reported for another commit', () => {
    const result = gate([pair({}, { head_sha: OTHER_SHA })]);
    expect(result.ok).toBe(false);
    expect(result.notes[0]).toContain(`reported for ${OTHER_SHA}`);
    expect(result.problems[0]).toContain('No CI check');
  });

  test('refuses a workflow run for another commit', () => {
    const result = gate([pair({ head_sha: OTHER_SHA }, { head_sha: SHA })]);
    expect(result.ok).toBe(false);
    expect(result.notes[0]).toContain(`workflow run is for ${OTHER_SHA}`);
  });

  test('refuses a pull_request run, which tests a merge commit', () => {
    const result = gate([pair({ event: 'pull_request' })]);
    expect(result.ok).toBe(false);
    expect(result.notes[0]).toContain('pull_request run');
  });

  test('refuses a CI check from another app or another workflow', () => {
    expect(gate([pair({}, { app: { slug: 'someone-else' } })]).ok).toBe(false);
    expect(gate([pair({}, { app: null })]).ok).toBe(false);
    expect(gate([pair({ path: '.github/workflows/release.yml' })]).ok).toBe(false);
  });

  test('refuses a check whose suite has no workflow run', () => {
    const [check] = pair();
    const result = evaluateRequiredChecks({
      sha: SHA,
      requiredChecks: ['CI'],
      workflowPath: CI_PATH,
      checkRuns: [check],
      workflowRuns: [],
    });
    expect(result.ok).toBe(false);
    expect(result.notes[0]).toContain('no workflow run matches');
  });

  test('refuses when CI never ran on the commit', () => {
    expect(gate([]).problems[0]).toContain(`No CI check from ${CI_PATH}`);
  });

  test('lets the most recent run decide', () => {
    const passedThenFailed = [pair(), pair({ event: 'workflow_dispatch', conclusion: 'failure' })];
    expect(gate(passedThenFailed).ok).toBe(false);
    const failedThenPassed = [
      pair({ conclusion: 'failure' }),
      pair({ event: 'workflow_dispatch' }),
    ];
    expect(gate(failedThenPassed).ok).toBe(true);
  });

  test('ignores a newer pull_request run when an exact-commit run passed', () => {
    expect(gate([pair(), pair({ event: 'pull_request', conclusion: 'failure' })]).ok).toBe(true);
  });

  test('requires every configured check', () => {
    const result = gate([pair()], ['CI', 'Release Smoke']);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('No Release Smoke check');
  });

  test('refuses an empty check list', () => {
    expect(gate([pair()], []).ok).toBe(false);
  });
});

describe('release channels', () => {
  const published = (tag_name: string, overrides: Partial<Release> = {}): Release => ({
    id: 1,
    tag_name,
    draft: false,
    prerelease: false,
    upload_url: '',
    ...overrides,
  });

  test('orders versions numerically, with a release candidate before its release', () => {
    expect(compareVersions('v0.10.0', 'v0.9.9')).toBe(1);
    expect(compareVersions('v1.0.0-rc.2', 'v1.0.0')).toBe(-1);
    expect(compareVersions('v1.0.0-rc.10', 'v1.0.0-rc.9')).toBe(1);
    expect(compareVersions('v0.8.0', 'v0.8.0')).toBe(0);
  });

  test('moves latest for the first or a newer stable release', () => {
    expect(planLatest('v0.8.0', []).latest).toBe(true);
    expect(planLatest('v0.9.0', [published('v0.8.0'), published('v0.8.1')]).latest).toBe(true);
    expect(planLatest('v1.0.0', [published('v1.0.0-rc.1', { prerelease: true })]).latest).toBe(
      true,
    );
  });

  test('keeps latest for a release candidate', () => {
    const result = planLatest('v1.0.0-rc.1', [published('v0.9.0')]);
    expect(result).toEqual({ latest: false, reason: expect.stringContaining('release candidate') });
  });

  test('keeps latest for a patch on an older line', () => {
    const result = planLatest('v0.8.1', [published('v0.8.0'), published('v0.9.0')]);
    expect(result.latest).toBe(false);
    expect(result.reason).toContain('latest stays on v0.9.0');
  });

  test('ignores drafts, prereleases and tags that are not release versions', () => {
    const releases = [
      published('v0.9.0', { draft: true }),
      published('v0.9.0-rc.1', { prerelease: true }),
      published('nightly'),
      published('v0.8.0'),
    ];
    expect(planLatest('v0.8.1', releases).latest).toBe(true);
  });
});

describe('planTag', () => {
  const base = { sha: SHA, version: 'v0.8.0', tagCommit: null, published: false };

  test('creates a missing tag', () => {
    expect(planTag(base)).toEqual({ createTag: true, problems: [] });
  });

  test('resumes when the tag already points at the commit', () => {
    expect(planTag({ ...base, tagCommit: SHA })).toEqual({ createTag: false, problems: [] });
  });

  test('refuses a tag at another commit', () => {
    expect(planTag({ ...base, tagCommit: OTHER_SHA }).problems[0]).toContain(
      `already points at ${OTHER_SHA}`,
    );
  });

  test('refuses a published release', () => {
    expect(planTag({ ...base, tagCommit: SHA, published: true }).problems[0]).toContain(
      'already published',
    );
  });
});

describe('draftsToReplace', () => {
  const release = (overrides: Partial<Release>): Release => ({
    id: 1,
    tag_name: 'v0.8.0',
    draft: true,
    upload_url: 'https://uploads.example/assets{?name,label}',
    author: { login: RELEASE_BOT_LOGIN },
    ...overrides,
  });

  test('replaces drafts the workflow created for the version only', () => {
    const result = draftsToReplace(
      [release({ id: 1 }), release({ id: 2, tag_name: 'v0.7.0' })],
      'v0.8.0',
    );
    expect(result).toEqual({ drafts: [release({ id: 1 })], problems: [] });
  });

  test('refuses a published release or a draft written by someone else', () => {
    expect(draftsToReplace([release({ draft: false })], 'v0.8.0').problems[0]).toContain(
      'already published',
    );
    expect(
      draftsToReplace([release({ author: { login: 'maintainer' } })], 'v0.8.0').problems[0],
    ).toContain('not created by the release workflow');
  });
});

describe('createGitHub uploads', () => {
  const calls: string[] = [];
  const fakeFetch = ((input: string | URL | Request) => {
    calls.push(String(input));
    return Promise.resolve(new Response('{}', { status: 201 }));
  }) as typeof fetch;
  const file = join(mkdtempSync(join(tmpdir(), 'quro-release-upload-')), 'asset.yml');
  writeFileSync(file, 'synthetic\n');
  const gh = (apiUrl?: string) =>
    createGitHub(
      { GITHUB_REPOSITORY: 'acme/quro', GITHUB_TOKEN: 'token', GITHUB_API_URL: apiUrl },
      fakeFetch,
    );

  test('sends the token only to the API host or GitHub uploads', async () => {
    calls.length = 0;
    await gh().upload(
      'https://uploads.github.com/repos/acme/quro/releases/1/assets{?name,label}',
      file,
    );
    await gh('https://git.example/api/v3').upload(
      'https://git.example/api/uploads/repos/acme/quro/releases/1/assets{?name,label}',
      file,
    );
    expect(calls).toEqual([
      'https://uploads.github.com/repos/acme/quro/releases/1/assets?name=asset.yml',
      'https://git.example/api/uploads/repos/acme/quro/releases/1/assets?name=asset.yml',
    ]);
  });

  test('refuses any other upload host', async () => {
    calls.length = 0;
    await expect(
      gh().upload('https://elsewhere.example/assets{?name,label}', file),
    ).rejects.toThrow('Refusing to upload');
    await expect(
      gh('https://git.example/api/v3').upload('https://uploads.github.com/assets', file),
    ).rejects.toThrow('Refusing to upload');
    expect(calls).toEqual([]);
  });
});

// ── CLI against a fake GitHub API ────────────────────────────────────────────

type FakeRelease = Release & { name: string; body: string; assets: string[] };

type FakeState = {
  checkRuns: CheckRun[];
  workflowRuns: WorkflowRun[];
  tags: Map<string, { type: 'commit' | 'tag'; sha: string }>;
  annotated: Map<string, string>;
  releases: FakeRelease[];
  writes: string[];
  failUploads: number;
  onCreateRef?: () => void;
};

const REPO = 'acme/quro';
const TOKEN = 'test-token';
let state: FakeState;
let releaseIds = 0;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const notFound = () => json({ message: 'Not Found' }, 404);

// Pages like GitHub: per_page entries from page (1-based).
function page<T>(items: T[], url: URL): T[] {
  const perPage = Number(url.searchParams.get('per_page') ?? 30);
  const start = (Number(url.searchParams.get('page') ?? 1) - 1) * perPage;
  return items.slice(start, start + perPage);
}

function apiRoutes(
  method: string,
  path: string,
  url: URL,
  request: Request,
): Promise<Response> | Response {
  const checkRuns = /^\/commits\/([0-9a-f]+)\/check-runs$/.exec(path);
  if (method === 'GET' && checkRuns) {
    const name = url.searchParams.get('check_name');
    const runs = state.checkRuns.filter(
      (run) => run.head_sha === checkRuns[1] && run.name === name,
    );
    return json({ total_count: runs.length, check_runs: page(runs, url) });
  }
  if (method === 'GET' && path === '/actions/runs') {
    const runs = state.workflowRuns.filter(
      (run) => run.head_sha === url.searchParams.get('head_sha'),
    );
    return json({ total_count: runs.length, workflow_runs: page(runs, url) });
  }
  const tagRef = /^\/git\/ref\/tags\/(.+)$/.exec(path);
  if (method === 'GET' && tagRef) {
    const object = state.tags.get(tagRef[1]);
    return object ? json({ ref: `refs/tags/${tagRef[1]}`, object }) : notFound();
  }
  const tagObject = /^\/git\/tags\/([0-9a-f]+)$/.exec(path);
  if (method === 'GET' && tagObject) {
    const commit = state.annotated.get(tagObject[1]);
    return commit ? json({ object: { type: 'commit', sha: commit } }) : notFound();
  }
  if (method === 'POST' && path === '/git/refs') return createRef(request);
  return releaseRoutes(method, path, url, request);
}

async function createRef(request: Request): Promise<Response> {
  const body = (await request.json()) as { ref: string; sha: string };
  state.onCreateRef?.();
  const name = body.ref.replace('refs/tags/', '');
  if (state.tags.has(name)) return json({ message: 'Reference already exists' }, 422);
  state.tags.set(name, { type: 'commit', sha: body.sha });
  state.writes.push(`tag ${name}`);
  return json({ ref: body.ref, object: { type: 'commit', sha: body.sha } }, 201);
}

async function releaseRoutes(
  method: string,
  path: string,
  url: URL,
  request: Request,
): Promise<Response> {
  const byTag = /^\/releases\/tags\/(.+)$/.exec(path);
  if (method === 'GET' && byTag) {
    const release = state.releases.find((entry) => entry.tag_name === byTag[1] && !entry.draft);
    return release ? json(release) : notFound();
  }
  if (method === 'GET' && path === '/releases') return json(page(state.releases, url));
  if (method === 'POST' && path === '/releases') {
    const body = (await request.json()) as {
      tag_name: string;
      name: string;
      body: string;
      draft: boolean;
    };
    releaseIds += 1;
    const release: FakeRelease = {
      ...body,
      id: releaseIds,
      author: { login: RELEASE_BOT_LOGIN },
      upload_url: `${server.url.origin}/uploads/repos/${REPO}/releases/${releaseIds}/assets{?name,label}`,
      assets: [],
    };
    state.releases.push(release);
    state.writes.push(`create release ${release.id}`);
    return json(release, 201);
  }
  const byId = /^\/releases\/(\d+)$/.exec(path);
  const release = byId ? state.releases.find((entry) => entry.id === Number(byId[1])) : undefined;
  if (!byId || !release) return notFound();
  if (method === 'GET') return json(release);
  if (method === 'PATCH') {
    Object.assign(release, await request.json());
    state.writes.push(`update release ${release.id}`);
    return json(release);
  }
  if (method === 'DELETE') {
    state.releases = state.releases.filter((entry) => entry !== release);
    state.writes.push(`delete release ${release.id}`);
    return new Response(null, { status: 204 });
  }
  return notFound();
}

function uploadRoute(path: string, url: URL): Response {
  const id = Number(/\/releases\/(\d+)\/assets$/.exec(path)?.[1]);
  const release = state.releases.find((entry) => entry.id === id);
  const name = url.searchParams.get('name') ?? '';
  if (!release) return notFound();
  if (state.failUploads > 0) {
    state.failUploads -= 1;
    return json({ message: 'Upload interrupted' }, 502);
  }
  if (release.assets.includes(name)) return json({ message: 'already_exists' }, 422);
  release.assets.push(name);
  state.writes.push(`upload ${name} to ${id}`);
  return json({ name }, 201);
}

const server = Bun.serve({
  port: 0,
  fetch(request) {
    if (request.headers.get('authorization') !== `Bearer ${TOKEN}`) {
      return json({ message: 'Bad credentials' }, 401);
    }
    const url = new URL(request.url);
    if (url.pathname.startsWith(`/uploads/repos/${REPO}/`)) return uploadRoute(url.pathname, url);
    const prefix = `/repos/${REPO}`;
    if (!url.pathname.startsWith(prefix)) return notFound();
    return apiRoutes(request.method, url.pathname.slice(prefix.length), url, request);
  },
});

afterAll(() => server.stop(true));

const workDir = mkdtempSync(join(tmpdir(), 'quro-release-gate-'));
const versionFile = join(workDir, 'VERSION');
const notesFile = join(workDir, 'release-notes.md');
const assets = [join(workDir, 'docker-compose.release.yml'), join(workDir, 'bundle-v0.8.0.tar.gz')];
writeFileSync(notesFile, '## [v0.8.0]\n\n- Synthetic notes.\n');
for (const asset of assets) writeFileSync(asset, 'synthetic asset\n');

function env(extra: Record<string, string> = {}): Record<string, string> {
  return {
    GITHUB_API_URL: server.url.origin,
    GITHUB_REPOSITORY: REPO,
    GITHUB_TOKEN: TOKEN,
    RELEASE_SHA: SHA,
    RELEASE_VERSION: 'v0.8.0',
    RELEASE_VERSION_FILE: versionFile,
    RELEASE_NOTES_FILE: notesFile,
    ...extra,
  };
}

async function run(args: string[], extra: Record<string, string> = {}) {
  const lines: string[] = [];
  const errors: string[] = [];
  const outputs: Record<string, string> = {};
  const out: Output = {
    log: (line) => lines.push(line),
    error: (line) => errors.push(line),
    setOutput: (key, value) => {
      outputs[key] = value;
    },
  };
  const code = await runCommand(args, env(extra), out);
  return { code, log: lines.join('\n'), error: errors.join('\n'), outputs };
}

// The jobs of release.yml in order; the build job runs between preflight and create-tag.
async function releaseAfterBuild(): Promise<number[]> {
  const codes = [(await run(['create-tag'])).code];
  const staged = await run(['stage-release', ...assets]);
  codes.push(staged.code);
  if (staged.code !== 0) return codes;
  codes.push(
    (
      await run(['publish-release'], {
        RELEASE_ID: staged.outputs.release_id,
        RELEASE_LATEST: staged.outputs.latest,
      })
    ).code,
  );
  return codes;
}

function passCi(sha = SHA): void {
  const [check, workflowRun] = pair({ head_sha: sha }, { head_sha: sha });
  state.checkRuns.push(check);
  state.workflowRuns.push(workflowRun);
}

function releasesFor(version: string) {
  return state.releases
    .filter((release) => release.tag_name === version)
    .map(({ draft, assets: names, body }) => ({ draft, assets: [...names].sort(), body }));
}

const PUBLISHED = [
  {
    draft: false,
    assets: ['bundle-v0.8.0.tar.gz', 'docker-compose.release.yml'],
    body: '## [v0.8.0]\n\n- Synthetic notes.\n',
  },
];

describe('release-gate CLI', () => {
  beforeEach(() => {
    writeFileSync(versionFile, 'v0.8.0\n');
    state = {
      checkRuns: [],
      workflowRuns: [],
      tags: new Map(),
      annotated: new Map(),
      releases: [],
      writes: [],
      failUploads: 0,
    };
  });

  test('preflight refuses a commit whose CI failed, before any write', async () => {
    const [check, workflowRun] = pair({ conclusion: 'failure' });
    state.checkRuns.push(check);
    state.workflowRuns.push(workflowRun);
    const result = await run(['preflight']);
    expect(result.code).toBe(1);
    expect(result.error).toContain('CI concluded failure');
    expect(result.outputs).toEqual({});
    expect(state.writes).toEqual([]);
  });

  test('preflight refuses a pending CI run and a commit CI never saw', async () => {
    expect((await run(['preflight'])).error).toContain('No CI check');
    const [check, workflowRun] = pair({ status: 'in_progress', conclusion: null });
    state.checkRuns.push(check);
    state.workflowRuns.push(workflowRun);
    expect((await run(['preflight'])).error).toContain('CI is still in_progress');
  });

  test('preflight treats VERSION as data', async () => {
    passCi();
    writeFileSync(versionFile, 'v0.8.0"; touch pwned; echo "\n');
    const result = await run(['preflight']);
    expect(result.code).toBe(1);
    expect(result.error).toContain('VERSION must look like');
    expect(state.writes).toEqual([]);
  });

  test('preflight outputs the exact commit and version when CI passed on it', async () => {
    passCi();
    passCi(OTHER_SHA);
    const result = await run(['preflight']);
    expect(result.code).toBe(0);
    expect(result.outputs).toEqual({ sha: SHA, version: 'v0.8.0' });
    expect(result.log).toContain('will be created after the images are built');
  });

  test('a failed build leaves no tag, so the same release can simply be dispatched again', async () => {
    passCi();
    expect((await run(['preflight'])).code).toBe(0);
    // The build job fails here, so create-tag and the publish job never run.
    expect(state.writes).toEqual([]);
    expect((await run(['preflight'])).code).toBe(0);
    expect(await releaseAfterBuild()).toEqual([0, 0, 0]);
    expect(state.tags.get('v0.8.0')).toEqual({ type: 'commit', sha: SHA });
    expect(releasesFor('v0.8.0')).toEqual(PUBLISHED);
  });

  test('a run that failed after tagging resumes on retry without stale assets', async () => {
    passCi();
    state.failUploads = 1;
    expect(await releaseAfterBuild()).toEqual([0, 1]);
    expect(releasesFor('v0.8.0')).toEqual([{ draft: true, assets: [], body: PUBLISHED[0].body }]);

    const retry = await run(['preflight']);
    expect(retry.code).toBe(0);
    expect(retry.log).toContain('an earlier run will be resumed');
    expect(await releaseAfterBuild()).toEqual([0, 0, 0]);
    expect(releasesFor('v0.8.0')).toEqual(PUBLISHED);
    expect(state.writes.filter((write) => write.startsWith('tag '))).toEqual(['tag v0.8.0']);
  });

  test('refuses another commit once a tag exists, and a published release', async () => {
    passCi();
    state.tags.set('v0.8.0', { type: 'commit', sha: OTHER_SHA });
    expect((await run(['preflight'])).error).toContain(`already points at ${OTHER_SHA}`);
    expect((await run(['create-tag'])).code).toBe(1);

    state.tags.set('v0.8.0', { type: 'commit', sha: SHA });
    expect(await releaseAfterBuild()).toEqual([0, 0, 0]);
    expect((await run(['preflight'])).error).toContain('already published');
    expect((await run(['stage-release', ...assets])).error).toContain('already published');
  });

  test('follows an annotated tag to its commit', async () => {
    passCi();
    state.tags.set('v0.8.0', { type: 'tag', sha: 'c'.repeat(40) });
    state.annotated.set('c'.repeat(40), SHA);
    expect((await run(['preflight'])).code).toBe(0);
    state.annotated.set('c'.repeat(40), OTHER_SHA);
    expect((await run(['preflight'])).code).toBe(1);
  });

  test('refuses to replace a draft written by someone else', async () => {
    state.tags.set('v0.8.0', { type: 'commit', sha: SHA });
    state.releases.push({
      id: 7,
      tag_name: 'v0.8.0',
      name: 'v0.8.0',
      body: 'hand-written',
      draft: true,
      upload_url: '',
      author: { login: 'maintainer' },
      assets: [],
    });
    expect((await run(['stage-release', ...assets])).error).toContain(
      'not created by the release workflow',
    );
    expect(state.writes).toEqual([]);
  });

  test('create-tag accepts a concurrent tag at the same commit only', async () => {
    state.onCreateRef = () => state.tags.set('v0.8.0', { type: 'commit', sha: SHA });
    expect((await run(['create-tag'])).code).toBe(0);
    state.tags.clear();
    state.onCreateRef = () => state.tags.set('v0.8.0', { type: 'commit', sha: OTHER_SHA });
    expect((await run(['create-tag'])).error).toContain(`already points at ${OTHER_SHA}`);
  });

  test('stage-release and publish-release require the tag at the commit', async () => {
    expect((await run(['stage-release', ...assets])).error).toContain('must point at');
    expect(
      (await run(['publish-release'], { RELEASE_ID: '1', RELEASE_LATEST: 'true' })).error,
    ).toContain('must point at');
    expect(
      (await run(['publish-release'], { RELEASE_ID: '1', RELEASE_LATEST: 'yes' })).error,
    ).toContain('RELEASE_LATEST must be true or false');
  });

  test('refuses unknown commands and malformed inputs', async () => {
    expect((await run(['tag-everything'])).error).toContain('Usage');
    expect((await run(['create-tag'], { RELEASE_SHA: 'main' })).error).toContain('40-character');
    expect((await run(['create-tag'], { GITHUB_REPOSITORY: 'acme' })).error).toContain(
      'owner/name',
    );
    expect((await run(['create-tag'], { GITHUB_TOKEN: 'wrong' })).error).toContain('401');
    expect(state.writes).toEqual([]);
  });

  test('reads every page of check runs and releases', async () => {
    for (let index = 0; index < 120; index += 1) {
      const [check, workflowRun] = pair({ event: 'pull_request' });
      state.checkRuns.push(check);
      state.workflowRuns.push(workflowRun);
    }
    passCi();
    expect((await run(['preflight'])).code).toBe(0);

    for (let index = 0; index < 150; index += 1) {
      state.releases.push({
        id: 10_000 + index,
        tag_name: `v0.0.${index}`,
        name: `v0.0.${index}`,
        body: '',
        draft: false,
        upload_url: '',
        author: { login: RELEASE_BOT_LOGIN },
        assets: [],
      });
    }
    state.failUploads = 1;
    expect(await releaseAfterBuild()).toEqual([0, 1]);
    expect(await releaseAfterBuild()).toEqual([0, 0, 0]);
    expect(releasesFor('v0.8.0')).toEqual(PUBLISHED);
  });

  test('publishes a release candidate as a prerelease without moving latest', async () => {
    passCi();
    writeFileSync(versionFile, 'v1.0.0-rc.1\n');
    expect((await run(['preflight'])).log).toContain('is a release candidate');

    state.tags.set('v1.0.0-rc.1', { type: 'commit', sha: SHA });
    const rc = await run(['stage-release', ...assets], { RELEASE_VERSION: 'v1.0.0-rc.1' });
    expect(rc.outputs.latest).toBe('false');
    expect(state.releases).toMatchObject([{ draft: true, prerelease: true }]);
    const publish = await run(['publish-release'], {
      RELEASE_VERSION: 'v1.0.0-rc.1',
      RELEASE_ID: rc.outputs.release_id,
      RELEASE_LATEST: rc.outputs.latest,
    });
    expect(publish.code).toBe(0);
    expect(state.releases).toMatchObject([
      { tag_name: 'v1.0.0-rc.1', draft: false, prerelease: true, make_latest: 'false' },
    ]);
  });

  test('publishes a patch on an older line without moving latest', async () => {
    passCi();
    state.releases.push({
      id: 9,
      tag_name: 'v0.9.0',
      name: 'v0.9.0',
      body: '',
      draft: false,
      prerelease: false,
      upload_url: '',
      author: { login: RELEASE_BOT_LOGIN },
      assets: [],
    });
    expect((await run(['preflight'])).log).toContain('latest stays on v0.9.0');
    expect(await releaseAfterBuild()).toEqual([0, 0, 0]);
    expect(state.releases.find((release) => release.tag_name === 'v0.8.0')).toMatchObject({
      draft: false,
      prerelease: false,
      make_latest: 'false',
    });
  });

  test('marks a newer stable release as latest', async () => {
    passCi();
    expect((await run(['preflight'])).log).toContain('v0.8.0 becomes latest');
    expect(await releaseAfterBuild()).toEqual([0, 0, 0]);
    expect(state.releases[0]).toMatchObject({ prerelease: false, make_latest: 'true' });
  });

  test('runs as a script and writes outputs to GITHUB_OUTPUT', async () => {
    passCi();
    const outputFile = join(workDir, 'github-output');
    writeFileSync(outputFile, '');
    const child = Bun.spawn(['bun', `${import.meta.dir}/release-gate.ts`, 'preflight'], {
      env: { ...process.env, ...env(), GITHUB_OUTPUT: outputFile },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stdout = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    expect(stdout).not.toContain(TOKEN);
    expect(readFileSync(outputFile, 'utf8')).toBe(`sha=${SHA}\nversion=v0.8.0\n`);
  });
});

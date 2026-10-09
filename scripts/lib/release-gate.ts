import { appendFileSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

// Release gate for .github/workflows/release.yml. Every subcommand reads its inputs from
// environment variables (never from interpolated shell), validates them as data and talks
// to the GitHub REST API with the job's token. Nothing here prints the token.
//
//   preflight        before any build: VERSION is valid, the required checks passed on the
//                    exact commit, and the tag and release do not block this commit
//   create-tag       after the images are built: create the tag, or confirm a tag left by an
//                    earlier run points at the same commit
//   stage-release    replace any draft an earlier run left and upload the assets to a new draft
//   publish-release  publish that draft

export const RELEASE_VERSION_PATTERN =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-rc\.(0|[1-9]\d*))?$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const RELEASE_ID_PATTERN = /^[1-9]\d*$/;
const GITHUB_ACTIONS_APP = 'github-actions';
const GITHUB_API_ORIGIN = 'https://api.github.com';
const GITHUB_UPLOADS_ORIGIN = 'https://uploads.github.com';
export const RELEASE_BOT_LOGIN = 'github-actions[bot]';
// CI runs for these events check out the commit itself. A pull_request run tests a merge
// of the pull request into its base branch, so it does not prove the commit on its own.
export const EXACT_COMMIT_EVENTS: readonly string[] = ['push', 'workflow_dispatch'];
export const DEFAULT_REQUIRED_CHECKS = 'CI';
export const DEFAULT_CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const MAX_TAG_DEPTH = 5;
const SHOWN_VERSION_LENGTH = 40;
const CLI_ARGS_START = 2;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;

export class ReleaseGateError extends Error {}

export function parseReleaseVersion(raw: string): string {
  const version = raw.trim();
  if (!RELEASE_VERSION_PATTERN.test(version)) {
    const shown = JSON.stringify(version.slice(0, SHOWN_VERSION_LENGTH));
    throw new ReleaseGateError(`VERSION must look like v1.2.3 or v1.2.3-rc.1; found ${shown}`);
  }
  return version;
}

export function parseCommitSha(raw: string): string {
  const sha = raw.trim();
  if (!COMMIT_SHA_PATTERN.test(sha)) {
    throw new ReleaseGateError('The release commit must be a full 40-character commit SHA');
  }
  return sha;
}

export function parseCheckNames(raw: string | undefined): string[] {
  const names = (raw ?? DEFAULT_REQUIRED_CHECKS)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) throw new ReleaseGateError('REQUIRED_CHECKS names no checks');
  return names;
}

// ── Required checks ──────────────────────────────────────────────────────────

export type CheckRun = {
  id: number;
  name: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  app?: { slug?: string } | null;
  check_suite?: { id: number } | null;
};

export type WorkflowRun = {
  id: number;
  path: string;
  event: string;
  status: string | null;
  conclusion: string | null;
  head_sha: string;
  check_suite_id: number;
};

export type CheckGateInput = {
  sha: string;
  requiredChecks: readonly string[];
  workflowPath: string;
  checkRuns: readonly CheckRun[];
  workflowRuns: readonly WorkflowRun[];
};

export type GateResult = { ok: boolean; notes: string[]; problems: string[] };

type Candidate = { check: CheckRun; run: WorkflowRun };

function ignoreReason(
  check: CheckRun,
  run: WorkflowRun | undefined,
  input: CheckGateInput,
): string | null {
  if (check.head_sha !== input.sha) return `it was reported for ${check.head_sha}`;
  if (check.app?.slug !== GITHUB_ACTIONS_APP) {
    return `it was reported by ${check.app?.slug ?? 'an unknown app'}, not GitHub Actions`;
  }
  if (!run) return 'no workflow run matches its check suite';
  if (run.path !== input.workflowPath) return `it comes from ${run.path}`;
  if (run.head_sha !== input.sha) return `its workflow run is for ${run.head_sha}`;
  if (!EXACT_COMMIT_EVENTS.includes(run.event)) {
    return `it comes from a ${run.event} run; only ${EXACT_COMMIT_EVENTS.join(' and ')} runs test this exact commit`;
  }
  return null;
}

function candidateProblem(name: string, sha: string, { check, run }: Candidate): string | null {
  if (check.status !== 'completed' || run.status !== 'completed') {
    const state = check.status === 'completed' ? run.status : check.status;
    return `${name} is still ${state} on ${sha} (workflow run ${run.id}). Wait for it to finish, then dispatch the release again.`;
  }
  if (check.conclusion !== 'success') {
    return `${name} concluded ${check.conclusion} on ${sha} (workflow run ${run.id}).`;
  }
  if (run.conclusion !== 'success') {
    return `CI workflow run ${run.id} for ${sha} concluded ${run.conclusion}.`;
  }
  return null;
}

function evaluateCheck(
  name: string,
  input: CheckGateInput,
  runsBySuite: ReadonlyMap<number, WorkflowRun>,
): { notes: string[]; problem: string | null } {
  const notes: string[] = [];
  const candidates: Candidate[] = [];
  for (const check of input.checkRuns.filter((entry) => entry.name === name)) {
    const run = check.check_suite ? runsBySuite.get(check.check_suite.id) : undefined;
    const reason = ignoreReason(check, run, input);
    if (reason || !run) notes.push(`Ignored ${name} check ${check.id}: ${reason}.`);
    else candidates.push({ check, run });
  }
  if (candidates.length === 0) {
    // An aggregate job reports its check only once the jobs it needs have finished.
    const running = input.workflowRuns.find(
      (run) =>
        run.path === input.workflowPath &&
        run.head_sha === input.sha &&
        EXACT_COMMIT_EVENTS.includes(run.event) &&
        run.status !== 'completed',
    );
    if (running) {
      const problem = `${name} has not reported yet: CI workflow run ${running.id} on ${input.sha} is still ${running.status}. Wait for it to finish, then dispatch the release again.`;
      return { notes, problem };
    }
    const problem = `No ${name} check from ${input.workflowPath} ran on a push or workflow_dispatch event for ${input.sha}. Merge the commit to main or dispatch CI on its branch, wait for it to pass, then dispatch the release again.`;
    return { notes, problem };
  }
  // The most recent run decides, so a later failing re-run blocks an earlier success.
  const latest = candidates.reduce((a, b) => (b.check.id > a.check.id ? b : a));
  const problem = candidateProblem(name, input.sha, latest);
  if (!problem) {
    notes.push(
      `${name} passed on ${input.sha} in workflow run ${latest.run.id} (${latest.run.event}).`,
    );
  }
  return { notes, problem };
}

export function evaluateRequiredChecks(input: CheckGateInput): GateResult {
  const notes: string[] = [];
  const problems: string[] = [];
  const runsBySuite = new Map(input.workflowRuns.map((run) => [run.check_suite_id, run]));
  if (input.requiredChecks.length === 0) problems.push('No required checks are configured.');
  for (const name of input.requiredChecks) {
    const result = evaluateCheck(name, input, runsBySuite);
    notes.push(...result.notes);
    if (result.problem) problems.push(result.problem);
  }
  return { ok: problems.length === 0, notes, problems };
}

// ── Tags and releases ────────────────────────────────────────────────────────

export type TagPlan = { createTag: boolean; problems: string[] };

export function planTag(input: {
  sha: string;
  version: string;
  tagCommit: string | null;
  published: boolean;
}): TagPlan {
  const problems: string[] = [];
  if (input.published) {
    problems.push(
      `Release ${input.version} is already published. Set a new VERSION in a release pull request to release again.`,
    );
  }
  if (input.tagCommit !== null && input.tagCommit !== input.sha) {
    problems.push(
      `Tag ${input.version} already points at ${input.tagCommit}, not ${input.sha}. Release that commit, or, if a failed run left the tag behind, delete the tag and its draft release first.`,
    );
  }
  return { createTag: input.tagCommit === null, problems };
}

export type Release = {
  id: number;
  tag_name: string;
  draft: boolean;
  upload_url: string;
  html_url?: string;
  author?: { login?: string } | null;
};

export function draftsToReplace(
  releases: readonly Release[],
  version: string,
): { drafts: Release[]; problems: string[] } {
  const problems: string[] = [];
  const drafts: Release[] = [];
  for (const release of releases.filter((entry) => entry.tag_name === version)) {
    if (!release.draft) {
      problems.push(`Release ${version} is already published (release ${release.id}).`);
    } else if (release.author?.login === RELEASE_BOT_LOGIN) {
      drafts.push(release);
    } else {
      problems.push(
        `Draft release ${release.id} for ${version} was not created by the release workflow. Publish or delete it by hand first.`,
      );
    }
  }
  return { drafts, problems };
}

// ── GitHub REST client ───────────────────────────────────────────────────────

export type Env = Record<string, string | undefined>;
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type RequestOptions = { body?: unknown; allowNotFound?: boolean };

export type GitHub = {
  request: <T>(method: Method, path: string, options?: RequestOptions) => Promise<T | null>;
  upload: (uploadUrl: string, file: string) => Promise<void>;
};

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ReleaseGateError(`${key} is not set`);
  return value;
}

export class GitHubHttpError extends ReleaseGateError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function failure(method: string, path: string, response: Response): Promise<never> {
  let detail = '';
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') detail = `: ${body.message}`;
  } catch {
    // Keep the status line only.
  }
  throw new GitHubHttpError(
    response.status,
    `${method} ${path} returned ${response.status}${detail}`,
  );
}

export function createGitHub(env: Env, fetchImpl: typeof fetch = fetch): GitHub {
  const repository = required(env, 'GITHUB_REPOSITORY');
  if (!REPOSITORY_PATTERN.test(repository)) {
    throw new ReleaseGateError('GITHUB_REPOSITORY must look like owner/name');
  }
  const apiUrl = (env.GITHUB_API_URL?.trim() || GITHUB_API_ORIGIN).replace(/\/+$/, '');
  const apiOrigin = new URL(apiUrl).origin;
  const uploadOrigins = new Set(
    apiOrigin === GITHUB_API_ORIGIN ? [apiOrigin, GITHUB_UPLOADS_ORIGIN] : [apiOrigin],
  );
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${required(env, 'GITHUB_TOKEN')}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  return {
    async request<T>(method: Method, path: string, options: RequestOptions = {}) {
      const url = `${apiUrl}/repos/${repository}${path}`;
      const response = await fetchImpl(url, {
        method,
        headers:
          options.body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      if (response.status === HTTP_NOT_FOUND && options.allowNotFound) return null;
      if (!response.ok) return failure(method, path, response);
      const text = await response.text();
      return (text ? JSON.parse(text) : null) as T | null;
    },
    async upload(uploadUrl: string, file: string) {
      const url = new URL(uploadUrl.replace(/\{[^}]*\}$/, ''));
      // The token goes only to the API host, or to GitHub's upload host for api.github.com.
      if (!uploadOrigins.has(url.origin)) {
        throw new ReleaseGateError(`Refusing to upload release assets to ${url.origin}`);
      }
      url.searchParams.set('name', basename(file));
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: readFileSync(file),
      });
      if (!response.ok) await failure('POST', `release asset ${basename(file)}`, response);
    },
  };
}

async function listPages<T>(gh: GitHub, path: string, pick: (body: unknown) => T[]): Promise<T[]> {
  const items: T[] = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await gh.request<unknown>(
      'GET',
      `${path}${separator}per_page=${PAGE_SIZE}&page=${page}`,
    );
    const batch = pick(body);
    items.push(...batch);
    if (batch.length < PAGE_SIZE) return items;
  }
  throw new ReleaseGateError(`${path} has more than ${MAX_PAGES * PAGE_SIZE} entries`);
}

export function listCheckRuns(gh: GitHub, sha: string, name: string): Promise<CheckRun[]> {
  const path = `/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}&filter=latest`;
  return listPages(gh, path, (body) => (body as { check_runs: CheckRun[] }).check_runs);
}

export function listWorkflowRuns(gh: GitHub, sha: string): Promise<WorkflowRun[]> {
  return listPages(gh, `/actions/runs?head_sha=${sha}`, (body) => {
    return (body as { workflow_runs: WorkflowRun[] }).workflow_runs;
  });
}

type GitObject = { type: string; sha: string };

// Returns the commit a tag points at, following annotated tags, or null when it does not exist.
export async function getTagCommit(gh: GitHub, version: string): Promise<string | null> {
  const ref = await gh.request<{ object: GitObject }>('GET', `/git/ref/tags/${version}`, {
    allowNotFound: true,
  });
  let object = ref?.object ?? null;
  for (let depth = 0; object && object.type === 'tag' && depth < MAX_TAG_DEPTH; depth += 1) {
    const tag = await gh.request<{ object: GitObject }>('GET', `/git/tags/${object.sha}`);
    object = tag?.object ?? null;
  }
  if (!object) return null;
  if (object.type !== 'commit') {
    throw new ReleaseGateError(`Tag ${version} does not point at a commit (${object.type})`);
  }
  return object.sha;
}

async function isPublished(gh: GitHub, version: string): Promise<boolean> {
  const release = await gh.request('GET', `/releases/tags/${version}`, { allowNotFound: true });
  return release !== null;
}

// ── Subcommands ──────────────────────────────────────────────────────────────

export type Output = {
  log: (line: string) => void;
  error: (line: string) => void;
  setOutput: (key: string, value: string) => void;
};

function assertNoProblems(problems: string[]): void {
  if (problems.length > 0) throw new ReleaseGateError(problems.join('\n'));
}

export async function preflight(env: Env, gh: GitHub, out: Output): Promise<void> {
  const sha = parseCommitSha(required(env, 'RELEASE_SHA'));
  const version = parseReleaseVersion(readFileSync(required(env, 'RELEASE_VERSION_FILE'), 'utf8'));
  const requiredChecks = parseCheckNames(env.REQUIRED_CHECKS);
  const workflowPath = env.CI_WORKFLOW_PATH?.trim() || DEFAULT_CI_WORKFLOW_PATH;
  out.log(`Release ${version} from ${sha}`);

  const checkRuns = (
    await Promise.all(requiredChecks.map((name) => listCheckRuns(gh, sha, name)))
  ).flat();
  const workflowRuns = await listWorkflowRuns(gh, sha);
  const gate = evaluateRequiredChecks({
    sha,
    requiredChecks,
    workflowPath,
    checkRuns,
    workflowRuns,
  });
  gate.notes.forEach((note) => out.log(note));

  const plan = planTag({
    sha,
    version,
    tagCommit: await getTagCommit(gh, version),
    published: await isPublished(gh, version),
  });
  assertNoProblems([...gate.problems, ...plan.problems]);
  out.log(
    plan.createTag
      ? `Tag ${version} will be created after the images are built.`
      : `Tag ${version} already points at ${sha}; an earlier run will be resumed.`,
  );
  out.setOutput('sha', sha);
  out.setOutput('version', version);
}

function releaseInputs(env: Env): { sha: string; version: string } {
  return {
    sha: parseCommitSha(required(env, 'RELEASE_SHA')),
    version: parseReleaseVersion(required(env, 'RELEASE_VERSION')),
  };
}

export async function createTag(env: Env, gh: GitHub, out: Output): Promise<void> {
  const { sha, version } = releaseInputs(env);
  const plan = planTag({
    sha,
    version,
    tagCommit: await getTagCommit(gh, version),
    published: await isPublished(gh, version),
  });
  assertNoProblems(plan.problems);
  if (!plan.createTag) {
    out.log(`Tag ${version} already points at ${sha}; resuming.`);
    return;
  }
  try {
    await gh.request('POST', '/git/refs', { body: { ref: `refs/tags/${version}`, sha } });
    out.log(`Created tag ${version} at ${sha}.`);
  } catch (error) {
    // Another writer may have created the tag since the check above; accept it only if it matches.
    if (!(error instanceof GitHubHttpError) || error.status !== HTTP_UNPROCESSABLE) throw error;
    const tagCommit = await getTagCommit(gh, version);
    assertNoProblems(planTag({ sha, version, tagCommit, published: false }).problems);
    if (tagCommit === null) throw error;
    out.log(`Tag ${version} already points at ${sha}; resuming.`);
  }
}

async function requireTagAt(gh: GitHub, sha: string, version: string): Promise<void> {
  const tagCommit = await getTagCommit(gh, version);
  if (tagCommit !== sha) {
    throw new ReleaseGateError(
      `Tag ${version} must point at ${sha} before the release is staged or published (found ${tagCommit ?? 'no tag'}).`,
    );
  }
}

export async function stageRelease(
  env: Env,
  gh: GitHub,
  out: Output,
  assets: string[],
): Promise<void> {
  const { sha, version } = releaseInputs(env);
  if (assets.length === 0)
    throw new ReleaseGateError('stage-release needs at least one asset file');
  const notes = readFileSync(required(env, 'RELEASE_NOTES_FILE'), 'utf8');
  await requireTagAt(gh, sha, version);

  const releases = await listPages(gh, '/releases', (body) => body as Release[]);
  const { drafts, problems } = draftsToReplace(releases, version);
  assertNoProblems(problems);
  for (const draft of drafts) {
    await gh.request('DELETE', `/releases/${draft.id}`);
    out.log(`Removed draft release ${draft.id} left by an earlier run.`);
  }

  const release = await gh.request<Release>('POST', '/releases', {
    body: { tag_name: version, name: version, body: notes, draft: true },
  });
  if (!release) throw new ReleaseGateError('Creating the draft release returned no release');
  for (const asset of assets) {
    await gh.upload(release.upload_url, asset);
    out.log(`Uploaded ${basename(asset)}.`);
  }
  out.log(`Staged draft release ${release.id} for ${version}.`);
  out.setOutput('release_id', String(release.id));
}

export async function publishRelease(env: Env, gh: GitHub, out: Output): Promise<void> {
  const { sha, version } = releaseInputs(env);
  const releaseId = required(env, 'RELEASE_ID');
  if (!RELEASE_ID_PATTERN.test(releaseId))
    throw new ReleaseGateError('RELEASE_ID must be a release id');
  await requireTagAt(gh, sha, version);

  const draft = await gh.request<Release>('GET', `/releases/${releaseId}`);
  if (!draft || draft.tag_name !== version || !draft.draft) {
    throw new ReleaseGateError(`Release ${releaseId} is not the draft for ${version}.`);
  }
  const published = await gh.request<Release>('PATCH', `/releases/${releaseId}`, {
    body: { draft: false },
  });
  out.log(`Published ${version}${published?.html_url ? `: ${published.html_url}` : ''}.`);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

export function githubOutput(env: Env): Output {
  return {
    log: (line) => console.log(line),
    error: (line) => console.error(line),
    setOutput: (key, value) => {
      if (/[\r\n]/.test(value)) throw new ReleaseGateError(`Output ${key} contains a newline`);
      if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
      else console.log(`${key}=${value}`);
    },
  };
}

export async function runCommand(
  args: string[],
  env: Env,
  out: Output,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const [command, ...rest] = args;
  try {
    const gh = createGitHub(env, fetchImpl);
    if (command === 'preflight') await preflight(env, gh, out);
    else if (command === 'create-tag') await createTag(env, gh, out);
    else if (command === 'stage-release') await stageRelease(env, gh, out, rest);
    else if (command === 'publish-release') await publishRelease(env, gh, out);
    else
      throw new ReleaseGateError(
        'Usage: release-gate.ts preflight|create-tag|stage-release <asset...>|publish-release',
      );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    out.error(`Release gate refused: ${message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(
    await runCommand(process.argv.slice(CLI_ARGS_START), process.env, githubOutput(process.env)),
  );
}

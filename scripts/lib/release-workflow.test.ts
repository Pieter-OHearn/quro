import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { EXACT_COMMIT_EVENTS } from './release-gate';

type Step = {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  'working-directory'?: string;
};
type Job = {
  name?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  env?: Record<string, string>;
  jobs: Record<string, Job>;
};

const workflowsDir = `${import.meta.dir}/../../.github/workflows`;
const releaseText = readFileSync(`${workflowsDir}/release.yml`, 'utf8');
const release = Bun.YAML.parse(releaseText) as Workflow;
const ci = Bun.YAML.parse(readFileSync(`${workflowsDir}/ci.yml`, 'utf8')) as Workflow;
const { verify, publish } = release.jobs;
const build = release.jobs['build-images'];

function stepIndex(job: Job, pattern: RegExp): number {
  const index = job.steps.findIndex((step) => pattern.test(step.run ?? step.uses ?? ''));
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe('release.yml', () => {
  test('grants no token scope by default and least privilege per job', () => {
    expect(release.permissions).toEqual({});
    expect(verify.permissions).toEqual({ contents: 'read', checks: 'read', actions: 'read' });
    expect(build.permissions).toEqual({ contents: 'read', packages: 'write' });
    expect(publish.permissions).toEqual({ contents: 'write', packages: 'write' });
  });

  test('pins every action to a reviewed commit SHA with its version noted', () => {
    const uses = [...releaseText.matchAll(/^\s*(?:-\s+)?uses:\s*(.+)$/gm)].map((match) => match[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  });

  test('never interpolates expressions into shell', () => {
    for (const job of Object.values(release.jobs)) {
      for (const step of job.steps) expect(step.run ?? '').not.toContain('${{');
    }
  });

  test('never leaves git credentials in a checkout', () => {
    for (const job of Object.values(release.jobs)) {
      for (const step of job.steps.filter((entry) => entry.uses?.startsWith('actions/checkout@'))) {
        expect(step.with?.['persist-credentials']).toBe(false);
      }
    }
  });

  test('runs one release at a time', () => {
    expect(release.concurrency).toEqual({ group: 'release', 'cancel-in-progress': false });
  });

  test('builds only after the gate and tags only after the build', () => {
    expect(build.needs).toBe('verify');
    expect(publish.needs).toEqual(['verify', 'build-images']);
    expect(stepIndex(verify, /release-gate\.ts preflight/)).toBeGreaterThan(0);
    for (const step of [...verify.steps, ...build.steps]) {
      expect(step.run ?? '').not.toMatch(
        /create-tag|stage-release|publish-release|promote-images|git (tag|push)/,
      );
    }
  });

  test('pushes only candidate tags from the build job', () => {
    const script = build.steps.map((step) => step.run ?? '').join('\n');
    expect(script).toContain(':sha-$RELEASE_SHA');
    expect(script).not.toMatch(/latest|RELEASE_VERSION/);
    expect(build.env?.RELEASE_SHA).toBe('${{ needs.verify.outputs.sha }}');
  });

  test('publishes in a retry-safe order', () => {
    const lastReleaseCode = Math.max(
      ...publish.steps.flatMap((step, index) =>
        step['working-directory'] === 'release' ? [index] : [],
      ),
    );
    const login = stepIndex(publish, /^docker\/login-action@/);
    const tag = stepIndex(publish, /release-gate\.ts create-tag/);
    const version = stepIndex(publish, /promote-images\.sh "\$RELEASE_VERSION"/);
    const stage = stepIndex(publish, /release-gate\.ts stage-release/);
    const latest = stepIndex(publish, /promote-images\.sh latest/);
    const published = stepIndex(publish, /release-gate\.ts publish-release/);
    expect(lastReleaseCode).toBeLessThan(login);
    expect([login, tag, version, stage, latest, published]).toEqual(
      [login, tag, version, stage, latest, published].sort((a, b) => a - b),
    );
    expect(published).toBe(publish.steps.length - 1);
  });

  test('moves latest only when the staged release takes it', () => {
    const latest = publish.steps[stepIndex(publish, /promote-images\.sh latest/)];
    expect(latest.if).toBe("steps.draft.outputs.latest == 'true'");
    const published = publish.steps[stepIndex(publish, /release-gate\.ts publish-release/)];
    expect(published.env?.RELEASE_LATEST).toBe('${{ steps.draft.outputs.latest }}');
  });

  test('hands the API token only to the release gate steps', () => {
    for (const job of Object.values(release.jobs)) {
      expect(JSON.stringify(job.env ?? {})).not.toContain('github.token');
      for (const step of job.steps) {
        if (step.env?.GITHUB_TOKEN === undefined) continue;
        expect(step.env.GITHUB_TOKEN).toBe('${{ github.token }}');
        expect(step.run).toMatch(
          /^bun scripts\/lib\/release-gate\.ts (preflight|create-tag|stage-release|publish-release)/,
        );
      }
    }
  });

  test('requires the aggregate CI job from ci.yml, which runs for every accepted event', () => {
    expect(release.env?.CI_WORKFLOW_PATH).toBe('.github/workflows/ci.yml');
    expect(release.env?.REQUIRED_CHECKS).toBe(ci.jobs.ci.name);
    for (const event of EXACT_COMMIT_EVENTS) expect(Object.keys(ci.on)).toContain(event);
  });
});

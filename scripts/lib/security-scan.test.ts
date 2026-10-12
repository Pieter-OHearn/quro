import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkExceptions,
  evaluateGitleaks,
  evaluateTrivy,
  GITLEAKS_IMAGE,
  incompleteScan,
  renderMarkdown,
  scannedCommits,
  TRIVY_IMAGE,
} from './security-scan';

const ROOT = join(import.meta.dir, '..', '..');

const report = {
  Results: [
    {
      Target: 'quro-backend:ci (debian 13.7)',
      Vulnerabilities: [
        {
          VulnerabilityID: 'CVE-1',
          PkgName: 'libfoo',
          InstalledVersion: '1.0',
          FixedVersion: '1.1',
          Severity: 'CRITICAL' as const,
        },
        {
          VulnerabilityID: 'CVE-2',
          PkgName: 'libbar',
          InstalledVersion: '2.0',
          Severity: 'HIGH' as const,
        },
        {
          VulnerabilityID: 'CVE-3',
          PkgName: 'libbaz',
          InstalledVersion: '3.0',
          Severity: 'MEDIUM' as const,
        },
      ],
    },
    {
      Target: 'packages/backend/Dockerfile',
      Misconfigurations: [
        {
          ID: 'DS-0002',
          Title: 'Image user should not be root',
          Severity: 'HIGH' as const,
          Status: 'FAIL',
        },
        {
          ID: 'DS-0031',
          Title: 'Secrets in build args',
          Severity: 'CRITICAL' as const,
          Status: 'FAIL',
          CauseMetadata: { StartLine: 9 },
        },
        { ID: 'DS-0026', Title: 'No HEALTHCHECK', Severity: 'CRITICAL' as const, Status: 'PASS' },
      ],
    },
    {
      Target: 'src/config.ts',
      Secrets: [{ RuleID: 'private-key', Severity: 'HIGH' as const, StartLine: 4, Match: '****' }],
    },
  ],
};

describe('evaluateTrivy', () => {
  const findings = evaluateTrivy(report);

  test('blocks critical vulnerabilities and misconfigurations and every secret', () => {
    expect(
      findings
        .filter((f) => f.blocking)
        .map((f) => f.id)
        .sort(),
    ).toEqual(['CVE-1', 'DS-0031', 'private-key']);
  });

  test('reports high findings for triage and leaves out lower severities and passed checks', () => {
    expect(
      findings
        .filter((f) => !f.blocking)
        .map((f) => f.id)
        .sort(),
    ).toEqual(['CVE-2', 'DS-0002']);
  });

  test('names the file and line of a secret without its value', () => {
    const secret = findings.find((f) => f.kind === 'secret');
    expect(secret?.where).toBe('src/config.ts:4');
    expect(JSON.stringify(secret)).not.toContain('****');
  });

  test('passes an empty report', () => {
    expect(evaluateTrivy({})).toEqual([]);
  });
});

describe('renderMarkdown', () => {
  test('lists blocking findings first and says how to resolve them', () => {
    const markdown = renderMarkdown('Image test', evaluateTrivy(report));
    expect(markdown).toContain('**3 blocking finding(s)**');
    expect(markdown).toContain('security-exceptions.yaml');
    const rows = markdown
      .split('\n')
      .filter((line) => line.startsWith('| blocks') || line.startsWith('| triage'));
    expect(rows.map((row) => row.split(' | ')[0])).toEqual([
      '| blocks',
      '| blocks',
      '| blocks',
      '| triage',
      '| triage',
    ]);
  });

  test('says so when nothing blocks', () => {
    expect(renderMarkdown('Clean', [])).toContain('No blocking findings. 0 reported for triage.');
  });
});

describe('checkExceptions', () => {
  const entry = (fields: Record<string, string>) =>
    `vulnerabilities:\n  - ${Object.entries(fields)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n    ')}\n`;
  const valid = {
    id: 'CVE-1',
    statement: 'not reachable',
    owner: 'someone',
    expired_at: '2026-11-30',
  };

  test('accepts an owned entry that expires within 90 days', () => {
    expect(checkExceptions(entry(valid), '2026-10-12')).toMatchObject({ errors: [], expired: [] });
  });

  test('accepts an empty file and empty sections', () => {
    expect(checkExceptions('', '2026-10-12').errors).toEqual([]);
    expect(checkExceptions('vulnerabilities: []\nsecrets:\n', '2026-10-12').errors).toEqual([]);
  });

  test.each(['id', 'statement', 'owner', 'expired_at'])('requires %s', (field) => {
    const fields: Record<string, string> = { ...valid };
    delete fields[field];
    expect(checkExceptions(entry(fields), '2026-10-12').errors.join('\n')).toContain(field);
  });

  test('refuses an expiry more than 90 days ahead or not a date', () => {
    expect(
      checkExceptions(entry({ ...valid, expired_at: '2027-01-11' }), '2026-10-12').errors[0],
    ).toContain('more than 90 days');
    expect(
      checkExceptions(entry({ ...valid, expired_at: '2026-02-30' }), '2026-10-12').errors[0],
    ).toContain('must be a date');
  });

  test('reports an expired entry separately', () => {
    const result = checkExceptions(entry({ ...valid, expired_at: '2026-10-12' }), '2026-10-12');
    expect(result.errors).toEqual([]);
    expect(result.expired[0]).toContain('expired on 2026-10-12');
  });

  test('refuses unknown sections', () => {
    expect(checkExceptions('vulns: []\n', '2026-10-12').errors[0]).toContain('unknown section');
  });

  test('the repository file is valid', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(
      checkExceptions(readFileSync(join(ROOT, 'security-exceptions.yaml'), 'utf8'), today).errors,
    ).toEqual([]);
  });
});

describe('evaluateGitleaks', () => {
  const leaks = [
    {
      RuleID: 'github-pat',
      File: 'src/a.ts',
      StartLine: 3,
      Commit: 'a'.repeat(40),
      Fingerprint: `${'a'.repeat(40)}:src/a.ts:github-pat:3`,
    },
    {
      RuleID: 'generic-api-key',
      File: 'docs/b.md',
      StartLine: 7,
      Commit: 'b'.repeat(40),
      Fingerprint: `${'b'.repeat(40)}:docs/b.md:generic-api-key:7`,
    },
  ];

  test('blocks every finding and names where it is, without the secret', () => {
    const findings = evaluateGitleaks(leaks, new Set());
    expect(findings.map((f) => [f.blocking, f.where])).toEqual([
      [true, 'src/a.ts:3'],
      [true, 'docs/b.md:7'],
    ]);
  });

  test('skips findings whose fingerprint has an active exception', () => {
    const findings = evaluateGitleaks(leaks, new Set([leaks[1]!.Fingerprint]));
    expect(findings.map((f) => f.id)).toEqual(['github-pat']);
  });

  test('only unexpired, complete secret exceptions are active', () => {
    const text = [
      'secrets:',
      `  - { id: "${leaks[0]!.Fingerprint}", statement: test fixture, owner: someone, expired_at: 2026-11-01 }`,
      `  - { id: "${leaks[1]!.Fingerprint}", statement: old, owner: someone, expired_at: 2026-10-01 }`,
      '  - { id: other, statement: no owner, expired_at: 2026-11-01 }',
    ].join('\n');
    expect([...checkExceptions(text, '2026-10-12').activeSecretIds]).toEqual([
      leaks[0]!.Fingerprint,
    ]);
  });
});

test('reads the scanned commit count from the gitleaks log, colour codes included', () => {
  expect(
    scannedCommits('\x1b[90m2:31PM\x1b[0m \x1b[32mINF\x1b[0m \x1b[1m291 commits scanned.\x1b[0m\n'),
  ).toBe(291);
  expect(scannedCommits('INF 0 commits scanned.')).toBe(0);
  expect(scannedCommits('ERR fatal: not a git repository')).toBeUndefined();
});

describe('incompleteScan', () => {
  test('requires the image operating system to be detected', () => {
    expect(
      incompleteScan('image', { Metadata: { OS: { Family: 'debian', Name: '13.7' } } }),
    ).toBeUndefined();
    expect(incompleteScan('image', { Results: [] })).toContain('operating system');
  });

  test('requires the config scan to have checked both core Dockerfiles', () => {
    const checked = (target: string) => ({
      Target: target,
      MisconfSummary: { Successes: 27, Failures: 0 },
    });
    expect(
      incompleteScan('config', {
        Results: [checked('packages/backend/Dockerfile'), checked('packages/frontend/Dockerfile')],
      }),
    ).toBeUndefined();
    expect(incompleteScan('config', { Results: [checked('packages/backend/Dockerfile')] })).toBe(
      'Trivy did not check packages/frontend/Dockerfile',
    );
    expect(incompleteScan('config', {})).toContain('packages/backend/Dockerfile');
  });
});

test('the scanner images are pinned by digest', () => {
  expect(TRIVY_IMAGE).toMatch(/^aquasec\/trivy:\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/);
  expect(GITLEAKS_IMAGE).toMatch(
    /^ghcr\.io\/gitleaks\/gitleaks:v\d+\.\d+\.\d+@sha256:[a-f0-9]{64}$/,
  );
});

// Security scans that CI runs, and the gate it applies to their results (SECURITY.md, "How
// findings are handled"). Both scanners run from container images pinned by digest.
//
//   bun scripts/lib/security-scan.ts image <image>          Trivy: vulnerabilities and secrets in an image
//   bun scripts/lib/security-scan.ts config                 Trivy: misconfigured Dockerfiles
//   bun scripts/lib/security-scan.ts secrets [<rev-range>]  gitleaks: secrets in commits (default: all refs)
//   bun scripts/lib/security-scan.ts exceptions [--strict]  check security-exceptions.yaml
//
// The gate fails on a critical vulnerability or misconfiguration, on any secret, and on an
// exceptions file that is malformed. Expired exceptions stop applying on their expiry date; the
// `exceptions` mode reports them, and fails on them with --strict. Output names the rule, file and
// line of a finding, never the matched text. Only files git tracks or would track are scanned, so
// ignored files such as .env and secrets/ are never read.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Update a tag and its digest together: docker buildx imagetools inspect <image>:<tag>
export const TRIVY_IMAGE =
  'aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969';
export const GITLEAKS_IMAGE =
  'ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f';
const TRIVY_CACHE_VOLUME = 'quro-trivy-cache';
export const EXCEPTIONS_FILE = 'security-exceptions.yaml';
export const MAX_EXCEPTION_DAYS = 90;
const EXCEPTION_KINDS = ['vulnerabilities', 'misconfigurations', 'secrets'] as const;

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type TrivyReport = {
  Results?: {
    Target: string;
    Vulnerabilities?: {
      VulnerabilityID: string;
      PkgName: string;
      InstalledVersion?: string;
      FixedVersion?: string;
      Severity: Severity;
    }[];
    Misconfigurations?: {
      ID: string;
      Title: string;
      Severity: Severity;
      Status?: string;
      CauseMetadata?: { StartLine?: number };
    }[];
    Secrets?: { RuleID: string; Severity: Severity; StartLine?: number }[];
  }[];
};

export type GitleaksFinding = {
  RuleID: string;
  File: string;
  StartLine?: number;
  Commit?: string;
  Fingerprint: string;
};

export type Finding = {
  kind: 'vulnerability' | 'misconfiguration' | 'secret';
  severity: Severity;
  id: string;
  where: string;
  detail: string;
  blocking: boolean;
};

const REPORTED: readonly Severity[] = ['CRITICAL', 'HIGH'];
const USAGE_EXIT_CODE = 2;
const MiB = 1024 * 1024;

/** YYYY-MM-DD of a date in UTC. */
const isoDay = (date: Date) => date.toISOString().split('T')[0]!;

function sortFindings(findings: Finding[]): Finding[] {
  // Blocking first, then by severity.
  const order = (f: Finding) => [f.blocking ? 0 : 1, Math.max(0, REPORTED.indexOf(f.severity))];
  return findings.sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    return x[0]! - y[0]! || x[1]! - y[1]!;
  });
}

type TrivyResult = NonNullable<TrivyReport['Results']>[number];

const at = (target: string, line?: number) => (line ? `${target}:${line}` : target);

function vulnerabilityFindings(result: TrivyResult): Finding[] {
  return (result.Vulnerabilities ?? [])
    .filter((v) => REPORTED.includes(v.Severity))
    .map((v) => ({
      kind: 'vulnerability',
      severity: v.Severity,
      id: v.VulnerabilityID,
      where: result.Target,
      detail: `${v.PkgName} ${v.InstalledVersion ?? ''} (${v.FixedVersion ? `fixed in ${v.FixedVersion}` : 'no fix yet'})`,
      blocking: v.Severity === 'CRITICAL',
    }));
}

function misconfigurationFindings(result: TrivyResult): Finding[] {
  return (result.Misconfigurations ?? [])
    .filter((m) => (!m.Status || m.Status === 'FAIL') && REPORTED.includes(m.Severity))
    .map((m) => ({
      kind: 'misconfiguration',
      severity: m.Severity,
      id: m.ID,
      where: at(result.Target, m.CauseMetadata?.StartLine),
      detail: m.Title,
      blocking: m.Severity === 'CRITICAL',
    }));
}

function secretFindings(result: TrivyResult): Finding[] {
  return (result.Secrets ?? []).map((secret) => ({
    kind: 'secret',
    severity: secret.Severity,
    id: secret.RuleID,
    where: at(result.Target, secret.StartLine),
    detail: 'matched text not shown',
    blocking: true,
  }));
}

/** Findings of a Trivy report worth a line in the report, with the gate's verdict on each. */
export function evaluateTrivy(report: TrivyReport): Finding[] {
  return sortFindings(
    (report.Results ?? []).flatMap((result) => [
      ...vulnerabilityFindings(result),
      ...misconfigurationFindings(result),
      ...secretFindings(result),
    ]),
  );
}

/** Every gitleaks finding blocks unless an active exception names its fingerprint. */
export function evaluateGitleaks(
  findings: readonly GitleaksFinding[],
  acceptedFingerprints: ReadonlySet<string>,
): Finding[] {
  return findings
    .filter((finding) => !acceptedFingerprints.has(finding.Fingerprint))
    .map((finding) => ({
      kind: 'secret' as const,
      severity: 'HIGH' as const,
      id: finding.RuleID,
      where: `${finding.File}${finding.StartLine ? `:${finding.StartLine}` : ''}`,
      detail: `commit ${finding.Commit?.slice(0, 12) ?? '?'}, fingerprint ${finding.Fingerprint}`,
      blocking: true,
    }));
}

export function renderMarkdown(title: string, findings: readonly Finding[]): string {
  const blocking = findings.filter((finding) => finding.blocking).length;
  const verdict =
    blocking > 0
      ? `**${blocking} blocking finding(s)**: fix them, or add an owned, expiring exception to \`${EXCEPTIONS_FILE}\` (SECURITY.md).`
      : 'No blocking findings.';
  const lines = [
    `### ${title}`,
    '',
    `${verdict} ${findings.length - blocking} reported for triage.`,
  ];
  if (findings.length > 0) {
    lines.push(
      '',
      '| Gate | Severity | Kind | ID | Where | Detail |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const f of findings) {
      const cells = [f.blocking ? 'blocks' : 'triage', f.severity, f.kind, f.id, f.where, f.detail];
      lines.push(`| ${cells.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function isoDate(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return isoDay(value);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || isoDay(parsed) !== value ? undefined : value;
}

export type ExceptionCheck = { errors: string[]; expired: string[]; activeSecretIds: Set<string> };

/**
 * Checks the exceptions file: each entry names what it covers (`id`), why the risk is accepted
 * (`statement`), who owns it (`owner`) and when it expires (`expired_at`, at most
 * MAX_EXCEPTION_DAYS after `today`). Expired entries are listed separately.
 */
export function checkExceptions(text: string, today: string): ExceptionCheck {
  const result: ExceptionCheck = { errors: [], expired: [], activeSecretIds: new Set() };
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(text);
  } catch (error) {
    result.errors.push(`not valid YAML: ${(error as Error).message}`);
    return result;
  }
  if (parsed === null || parsed === undefined) return result;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    result.errors.push('must be a mapping of finding kinds to lists');
    return result;
  }
  const latest = new Date(`${today}T00:00:00Z`);
  latest.setUTCDate(latest.getUTCDate() + MAX_EXCEPTION_DAYS);
  const latestIso = isoDay(latest);
  for (const [kind, entries] of Object.entries(parsed as Record<string, unknown>)) {
    if (!(EXCEPTION_KINDS as readonly string[]).includes(kind)) {
      result.errors.push(`unknown section "${kind}" (expected ${EXCEPTION_KINDS.join(', ')})`);
      continue;
    }
    if (entries === null) continue;
    if (!Array.isArray(entries)) {
      result.errors.push(`${kind} must be a list`);
      continue;
    }
    entries.forEach((entry: unknown, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        result.errors.push(`${kind}[${index}]: must be a mapping`);
        return;
      }
      const fields = entry as Record<string, unknown>;
      const label = `${kind}[${index}]${typeof fields.id === 'string' ? ` ${fields.id}` : ''}`;
      const before = result.errors.length;
      for (const field of ['id', 'statement', 'owner'] as const) {
        const value = fields[field];
        if (typeof value !== 'string' || !value.trim())
          result.errors.push(`${label}: "${field}" is required`);
      }
      const expiry = isoDate(fields.expired_at);
      if (!expiry) {
        result.errors.push(`${label}: "expired_at" must be a date (YYYY-MM-DD)`);
      } else if (expiry > latestIso) {
        result.errors.push(
          `${label}: expires ${expiry}, more than ${MAX_EXCEPTION_DAYS} days ahead (latest ${latestIso})`,
        );
      } else if (expiry <= today) {
        result.expired.push(
          `${label}: expired on ${expiry}; fix the finding, or renew it with a new statement`,
        );
      } else if (kind === 'secrets' && result.errors.length === before) {
        result.activeSecretIds.add(fields.id as string);
      }
    });
  }
  return result;
}

// ── Command line ──────────────────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dir, '..', '..');

function docker(args: string[]): string {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: 256 * MiB,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (result.status !== 0)
    throw new Error(`docker ${args[0]} failed with exit code ${result.status ?? result.signal}`);
  return result.stdout;
}

function trivy(mounts: string[], args: string[]): TrivyReport {
  const output = docker([
    'run',
    '--rm',
    '-v',
    `${TRIVY_CACHE_VOLUME}:/root/.cache/trivy`,
    '-v',
    `${join(ROOT, EXCEPTIONS_FILE)}:/config/exceptions.yaml:ro`,
    ...mounts.flatMap((mount) => ['-v', mount]),
    TRIVY_IMAGE,
    ...args,
    '--ignorefile',
    '/config/exceptions.yaml',
    '--quiet',
    '--format',
    'json',
    '--exit-code',
    '0',
  ]);
  return JSON.parse(output) as TrivyReport;
}

// Tracked files plus untracked files git does not ignore, as they are in the working tree.
function copyWorkingTree(target: string): void {
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * MiB,
    },
  )
    .split('\0')
    .filter(Boolean);
  for (const file of files) {
    mkdirSync(join(target, dirname(file)), { recursive: true });
    try {
      cpSync(join(ROOT, file), join(target, file), { dereference: false });
    } catch (error) {
      // A tracked file deleted in the working tree has nothing to scan.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function scanImage(image: string, work: string): Finding[] {
  const local = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status === 0;
  if (!local) return evaluateTrivy(trivy([], ['image', '--scanners', 'vuln,secret', image]));
  // A saved archive, so the scanner needs no access to the Docker socket.
  const input = join(work, 'input');
  mkdirSync(input);
  execFileSync('docker', ['save', '-o', join(input, 'image.tar'), image], { stdio: 'inherit' });
  const report = trivy(
    [`${input}:/input:ro`],
    ['image', '--scanners', 'vuln,secret', '--input', '/input/image.tar'],
  );
  for (const result of report.Results ?? [])
    result.Target = result.Target.replace('/input/image.tar', image);
  return evaluateTrivy(report);
}

function scanConfig(work: string): Finding[] {
  const tree = join(work, 'tree');
  mkdirSync(tree);
  copyWorkingTree(tree);
  return evaluateTrivy(trivy([`${tree}:/src:ro`], ['config', '/src']));
}

// Scanned commits as gitleaks logs them ("290 commits scanned."), with colour codes removed.
const ESCAPE = '\u001b';
const ANSI_COLOUR = new RegExp(`${ESCAPE}\\[[0-9;]*m`, 'g');

export function scannedCommits(log: string): number | undefined {
  const match = /(\d+) commits scanned/.exec(log.replace(ANSI_COLOUR, ''));
  return match ? Number(match[1]) : undefined;
}

function scanSecrets(
  range: string | undefined,
  accepted: ReadonlySet<string>,
  work: string,
): Finding[] {
  const out = join(work, 'out');
  mkdirSync(out);
  const user =
    process.getuid && process.getgid ? ['--user', `${process.getuid()}:${process.getgid()}`] : [];
  // A worktree's .git file points into the main repository's git directory: mount both at their
  // own paths so git resolves them inside the container.
  const gitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  const mounts = [ROOT, gitDir].filter(
    (path, index, all) => index === 0 || !path.startsWith(`${all[0]}/`),
  );
  const logOptions = range ?? '--all';
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      ...user,
      '-e',
      'HOME=/tmp',
      ...mounts.flatMap((path) => ['-v', `${path}:${path}:ro`]),
      '-v',
      `${out}:/out`,
      GITLEAKS_IMAGE,
      'git',
      '--redact',
      '--no-banner',
      '--exit-code',
      '0',
      '--report-format',
      'json',
      '--report-path',
      '/out/report.json',
      `--log-opts=${logOptions}`,
      ROOT,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] },
  );
  process.stderr.write(result.stderr ?? '');
  if (result.status !== 0)
    throw new Error(`gitleaks failed with exit code ${result.status ?? result.signal}`);
  // Fail closed: a git error inside the container would otherwise read as "no leaks".
  const expected = Number(
    execFileSync('git', ['rev-list', '--count', ...(range ? [range] : ['--all'])], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim(),
  );
  const scanned = scannedCommits(result.stderr ?? '');
  if (/fatal:/.test(result.stderr ?? '') || (expected > 0 && !scanned)) {
    throw new Error(
      `gitleaks scanned ${scanned ?? 'no'} of ${expected} commits; see its log above`,
    );
  }
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as GitleaksFinding[];
  return evaluateGitleaks(report, accepted);
}

const USAGE =
  'Usage: security-scan.ts image <image> | config | secrets [<rev-range>] | exceptions [--strict]';

function printExceptionProblems(check: ExceptionCheck, strict: boolean): void {
  for (const error of check.errors) console.error(`${EXCEPTIONS_FILE}: ${error}`);
  for (const entry of check.expired) {
    if (strict) console.error(`${EXCEPTIONS_FILE}: ${entry}`);
    else console.log(`::warning file=${EXCEPTIONS_FILE}::${entry}`);
  }
}

function runScan(
  mode: string | undefined,
  target: string | undefined,
  check: ExceptionCheck,
  work: string,
): { title: string; findings: Finding[] } | undefined {
  if (mode === 'image' && target)
    return { title: `Image ${target}`, findings: scanImage(target, work) };
  if (mode === 'config')
    return { title: 'Dockerfile misconfigurations', findings: scanConfig(work) };
  if (mode === 'secrets') {
    return {
      title: `Secrets in git history (${target ?? 'all branches and tags'})`,
      findings: scanSecrets(target, check.activeSecretIds, work),
    };
  }
  return undefined;
}

function main(argv: string[]): number {
  const [mode, ...args] = argv;
  const today = isoDay(new Date());
  const check = checkExceptions(readFileSync(join(ROOT, EXCEPTIONS_FILE), 'utf8'), today);
  const strict = mode === 'exceptions' && args.includes('--strict');
  printExceptionProblems(check, strict);
  if (mode === 'exceptions') {
    const failed = check.errors.length > 0 || (strict && check.expired.length > 0);
    if (!failed) console.log(`${EXCEPTIONS_FILE} is valid.`);
    return failed ? 1 : 0;
  }
  if (check.errors.length > 0) return 1;

  const work = mkdtempSync(join(tmpdir(), 'quro-security-scan-'));
  try {
    const scan = runScan(mode, args[0], check, work);
    if (!scan) {
      console.error(USAGE);
      return USAGE_EXIT_CODE;
    }
    const markdown = renderMarkdown(scan.title, scan.findings);
    console.log(markdown);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) writeFileSync(summary, markdown, { flag: 'a' });
    return scan.findings.some((finding) => finding.blocking) ? 1 : 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(USAGE_EXIT_CODE);
  }
}

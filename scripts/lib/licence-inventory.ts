// Licence inventory of what Quro ships: the production dependencies of the backend, frontend and
// shared workspaces (the backend image's node_modules and the frontend bundle) and, with
// --python, the packages installed for the optional statement-import parser.
//
//   bun scripts/lib/licence-inventory.ts [--python <interpreter>] [--out <file.md>]
//
// Run it after `bun install` (and, for --python, after installing
// services/pension-parser/requirements.txt into that interpreter's environment). It prints a
// Markdown inventory and exits 1 when a package has no licence or one outside ALLOWED; development
// tooling is not shipped and is not listed. Policy: docs/security.md#licences.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** SPDX identifiers whose terms allow shipping the package in Quro's MIT-licensed images. */
export const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'HPND',
  'ISC',
  'MIT',
  'MIT-CMU',
  'MPL-2.0',
  'OFL-1.1',
  'PSF-2.0',
  'Python-2.0',
  'Unlicense',
]);

const SHIPPED_WORKSPACES = ['packages/backend', 'packages/frontend', 'packages/shared'];

export type Package = { name: string; version: string; licence: string; usedBy: Set<string> };

type Manifest = {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

export function licenceOf(manifest: Manifest): string {
  const { license, licenses } = manifest;
  if (typeof license === 'string') return license.trim();
  if (license?.type) return license.type.trim();
  const types = (licenses ?? []).map((entry) => entry.type).filter(Boolean);
  return types.length > 0 ? `(${types.join(' OR ')})` : '';
}

/**
 * Whether an SPDX expression is acceptable: an OR needs one allowed side, an AND needs both.
 * `WITH` exceptions only add permissions, so the licence before them decides.
 */
export function isAllowed(expression: string): boolean {
  const tokens = expression.replace(/[()]/g, ' $& ').split(/\s+/).filter(Boolean);
  let position = 0;
  const parseOr = (): boolean => {
    let value = parseAnd();
    while (tokens[position]?.toUpperCase() === 'OR') {
      position += 1;
      value = parseAnd() || value;
    }
    return value;
  };
  const parseAnd = (): boolean => {
    let value = parseTerm();
    while (tokens[position]?.toUpperCase() === 'AND') {
      position += 1;
      value = parseTerm() && value;
    }
    return value;
  };
  const parseTerm = (): boolean => {
    const token = tokens[position++];
    if (token === '(') {
      const value = parseOr();
      position += 1; // ')'
      return value;
    }
    if (tokens[position]?.toUpperCase() === 'WITH') position += 2;
    return token !== undefined && ALLOWED.has(token);
  };
  if (tokens.length === 0) return false;
  const result = parseOr();
  return result && position === tokens.length;
}

function readManifest(directory: string): Manifest {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Manifest;
}

// Node's lookup: <ancestor>/node_modules/<name> from the package's real directory upwards.
function resolvePackage(from: string, name: string): string | undefined {
  let directory = from;
  for (;;) {
    if (basename(directory) !== 'node_modules') {
      const candidate = join(directory, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/** Production dependency closure of the shipped workspaces, keyed by name@version. */
export function collectJavaScript(root: string): {
  packages: Map<string, Package>;
  missing: string[];
} {
  const packages = new Map<string, Package>();
  const missing: string[] = [];
  const visited = new Set<string>();
  const visit = (directory: string, workspace: string) => {
    const manifest = readManifest(directory);
    const optional = new Set([
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.entries(manifest.peerDependenciesMeta ?? {})
        .filter(([, meta]) => meta.optional)
        .map(([name]) => name),
    ]);
    const dependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    for (const name of dependencies) {
      const resolved = resolvePackage(directory, name);
      if (!resolved) {
        // Optional and platform-specific packages are absent on other platforms.
        if (!optional.has(name))
          missing.push(`${name} (required by ${manifest.name ?? directory})`);
        continue;
      }
      const dependency = readManifest(resolved);
      if (resolved.startsWith(join(root, 'packages'))) {
        if (!visited.has(`${workspace}:${resolved}`)) {
          visited.add(`${workspace}:${resolved}`);
          visit(resolved, workspace);
        }
        continue; // a workspace package: Quro's own code
      }
      const key = `${dependency.name ?? name}@${dependency.version ?? '?'}`;
      const entry = packages.get(key) ?? {
        name: dependency.name ?? name,
        version: dependency.version ?? '?',
        licence: licenceOf(dependency),
        usedBy: new Set<string>(),
      };
      entry.usedBy.add(workspace);
      packages.set(key, entry);
      if (!visited.has(`${workspace}:${resolved}`)) {
        visited.add(`${workspace}:${resolved}`);
        visit(resolved, workspace);
      }
    }
  };
  for (const workspace of SHIPPED_WORKSPACES) {
    visit(join(root, workspace), workspace.replace('packages/', ''));
  }
  return { packages, missing };
}

// Licence of each installed distribution, from its metadata: License-Expression, a short License
// field, or the licence classifiers. Run with -I so nothing from the working directory is imported.
const PYTHON_LISTING = String.raw`
import json
from importlib.metadata import distributions
CLASSIFIERS = {
    "MIT License": "MIT",
    "BSD License": "BSD-3-Clause",
    "Apache Software License": "Apache-2.0",
    "ISC License (ISCL)": "ISC",
    "Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "Python Software Foundation License": "PSF-2.0",
    "Historical Permission Notice and Disclaimer (HPND)": "HPND",
}
SKIP = {"pip", "setuptools", "wheel"}
rows = []
for dist in distributions():
    meta = dist.metadata
    name = meta["Name"]
    if name is None or name.lower() in SKIP:
        continue
    licence = (meta.get("License-Expression") or "").strip()
    if not licence:
        text = (meta.get("License") or "").strip()
        if text and "\n" not in text and len(text) <= 40 and text.upper() != "UNKNOWN":
            licence = text
    if not licence:
        found = [CLASSIFIERS.get(c.split(" :: ")[-1]) for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
        found = sorted({f for f in found if f})
        licence = " OR ".join(found)
    rows.append({"name": name, "version": meta["Version"], "licence": licence})
print(json.dumps(rows))
`;

// Short licence names some Python packages use instead of SPDX identifiers.
const PYTHON_ALIASES: Record<string, string> = {
  MIT: 'MIT',
  'MIT License': 'MIT',
  BSD: 'BSD-3-Clause',
  'BSD License': 'BSD-3-Clause',
  'BSD-3-Clause': 'BSD-3-Clause',
  'Apache 2.0': 'Apache-2.0',
  'Apache License 2.0': 'Apache-2.0',
  'Apache Software License': 'Apache-2.0',
  'MPL-2.0': 'MPL-2.0',
};

export function collectPython(interpreter: string): Package[] {
  const output = execFileSync(interpreter, ['-I', '-c', PYTHON_LISTING], { encoding: 'utf8' });
  return (JSON.parse(output) as { name: string; version: string; licence: string }[]).map(
    (row) => ({
      name: row.name,
      version: row.version,
      licence: PYTHON_ALIASES[row.licence] ?? row.licence,
      usedBy: new Set(['pension-parser']),
    }),
  );
}

export function render(packages: readonly Package[], problems: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const entry of packages)
    counts.set(entry.licence || '(none)', (counts.get(entry.licence || '(none)') ?? 0) + 1);
  const lines = [
    '# Licence inventory',
    '',
    `${packages.length} shipped third-party packages. Generated by \`bun scripts/lib/licence-inventory.ts\`.`,
    '',
    '| Licence | Packages |',
    '| --- | --- |',
    ...[...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([licence, count]) => `| ${licence} | ${count} |`),
  ];
  if (problems.length > 0)
    lines.push('', '## Problems', '', ...problems.map((problem) => `- ${problem}`));
  lines.push(
    '',
    '## Packages',
    '',
    '| Package | Version | Licence | Shipped in |',
    '| --- | --- | --- | --- |',
  );
  for (const entry of [...packages].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  )) {
    lines.push(
      `| ${entry.name} | ${entry.version} | ${entry.licence || '(none)'} | ${[...entry.usedBy].sort().join(', ')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function findProblems(packages: readonly Package[]): string[] {
  return packages
    .filter((entry) => !isAllowed(entry.licence))
    .map(
      (entry) =>
        `${entry.name}@${entry.version}: ${entry.licence ? `licence ${entry.licence} is not in the allowed list` : 'no licence declared'}`,
    );
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const root = join(import.meta.dir, '..', '..');
  const { packages, missing } = collectJavaScript(root);
  const all = [...packages.values()];
  const python = option('--python');
  if (python) all.push(...collectPython(python));
  const problems = [
    ...missing.map((entry) => `not installed: ${entry}; run bun install first`),
    ...findProblems(all),
  ];
  const markdown = render(all, problems);
  const out = option('--out');
  if (out) writeFileSync(out, markdown);
  else console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown.split('\n## Packages')[0] + '\n', {
      flag: 'a',
    });
  }
  for (const problem of problems) console.error(problem);
  process.exit(problems.length > 0 ? 1 : 0);
}

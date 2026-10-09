import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

// Offline, deterministic checks for the Markdown docs: relative links and anchors, repository
// paths in inline code, `bun run` script names and environment variables in shell examples.
// External URLs are not fetched.

export type DocsProblem = { file: string; line: number; message: string };

export type DocsRepo = {
  /** Tracked Markdown files, repository-relative. */
  markdownFiles: string[];
  readText: (path: string) => string;
  exists: (path: string) => boolean;
  isIgnored: (path: string) => boolean;
  /** Script names per package directory ('.' for the root package). */
  scripts: Map<string, Set<string>>;
  /** Names of `@quro/*` packages mapped to their directory. */
  packageDirs: Map<string, string>;
  /** Text of every tracked non-Markdown file, used to recognise configuration names. */
  configCorpus: string;
};

// Inline-code paths under these roots must exist. Fragments such as `hooks/index.ts` are
// relative to a feature folder and are not checked.
const PATH_ROOTS = [
  '.github/',
  'deploy/',
  'docker/',
  'docs/',
  'packages/',
  'scripts/',
  'services/',
  'tests/',
];
const HISTORICAL_FILES = new Set(['CHANGELOG.md']);
// A file lists path prefixes that are deliberately not in the repository (illustrative examples,
// release-bundle files) in a `<!-- docs:check skip-paths: a/, b/c.js -->` comment.
const SKIP_PATHS_RE = /<!--\s*docs:check skip-paths:\s*([^>]*?)\s*-->/g;
const SHELL_FENCES = new Set(['', 'bash', 'sh', 'shell', 'console', 'zsh']);
const ENV_ASSIGNMENT_RE = /(?:^|\s)(?:export\s+)?([A-Z][A-Z0-9_]*)=/g;
const BUN_RUN_RE = /\bbun run\s+((?:--[\w-]+(?:[ =](?:'[^']*'|"[^"]*"|\S+))?\s+)*)([^\s;&|)`'"]+)/g;
const FILTER_RE = /--filter[ =](?:'([^']*)'|"([^"]*)"|(\S+))/;

type Line = { text: string; line: number };
type CodeBlock = { lang: string; lines: Line[] };

export type ParsedMarkdown = {
  prose: Line[];
  blocks: CodeBlock[];
  headings: string[];
};

const SETEXT_UNDERLINE_RE = /^ {0,3}(=+|-+)\s*$/;
// Lines that cannot be the text of a setext heading: blank, list items, tables, quotes, headings.
const NOT_SETEXT_TEXT_RE = /^\s*$|^\s*([-*+]|\d+[.)])\s|^\s*[|>#]/;

/** Number of leading lines taken by YAML front matter (`---` ... `---`), or 0. */
function frontMatterLength(lines: readonly string[]): number {
  if (lines[0]?.trim() !== '---') return 0;
  const end = lines.findIndex((text, index) => index > 0 && text.trim() === '---');
  return end < 0 ? 0 : end + 1;
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const prose: Line[] = [];
  const blocks: CodeBlock[] = [];
  const headings: string[] = [];
  let block: CodeBlock | null = null;
  let fence = '';
  let previousProse: string | null = null;

  const lines = content.split('\n');
  const skip = frontMatterLength(lines);
  lines.forEach((text, index) => {
    const line = index + 1;
    if (index < skip) return;
    if (block) {
      // A closing fence uses the same character, is at least as long and has no info string.
      const closing = /^\s*(`{3,}|~{3,})\s*$/.exec(text)?.[1];
      if (closing?.startsWith(fence)) {
        blocks.push(block);
        block = null;
      } else {
        block.lines.push({ text, line });
      }
      return;
    }
    const opening = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(text);
    if (opening) {
      const [, marker, lang] = opening;
      fence = marker;
      block = { lang: lang.toLowerCase(), lines: [] };
      previousProse = null;
      return;
    }
    prose.push({ text, line });
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(text);
    if (heading) headings.push(heading[1]);
    else if (
      previousProse !== null &&
      SETEXT_UNDERLINE_RE.test(text) &&
      !NOT_SETEXT_TEXT_RE.test(previousProse)
    ) {
      headings.push(previousProse.trim());
    }
    previousProse = text;
  });
  if (block) blocks.push(block);
  return { prose, blocks, headings };
}

/** Removes inline HTML tags, repeating until stable so nested fragments such as `<<b>b>` go too. */
function stripTags(text: string): string {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(/<[^<>]*>/g, '');
  } while (current !== previous);
  return current;
}

/** GitHub heading anchors: lower case, punctuation removed, spaces to hyphens, duplicates numbered. */
export function headingSlugs(headings: readonly string[]): Set<string> {
  const counts = new Map<string, number>();
  const slugs = new Set<string>();
  for (const heading of headings) {
    const text = stripTags(heading.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')).toLowerCase();
    const base = text.replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    slugs.add(seen === 0 ? base : `${base}-${seen}`);
  }
  return slugs;
}

function stripInlineCode(text: string): string {
  return text.replace(/`[^`]*`/g, '');
}

function linkTargets(text: string): string[] {
  const targets: string[] = [];
  for (const match of stripInlineCode(text).matchAll(
    /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
  )) {
    targets.push(match[1]);
  }
  for (const match of text.matchAll(/^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/g)) {
    targets.push(match[1]);
  }
  for (const match of stripInlineCode(text).matchAll(
    /<(?:a|img)\b[^>]*?\b(?:href|src)\s*=\s*["']([^"']+)["']/gi,
  )) {
    targets.push(match[1]);
  }
  return targets;
}

function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Returns a problem message for one relative link target, or null when it resolves. */
function checkLinkTarget(
  file: string,
  target: string,
  repo: DocsRepo,
  slugsFor: (path: string) => Set<string>,
): string | null {
  const hash = target.indexOf('#');
  const rawPath = hash < 0 ? target : target.slice(0, hash);
  const anchor = hash < 0 ? '' : target.slice(hash + 1);
  const path = rawPath
    ? normalize(join(dirname(file), safeDecode(rawPath))).replace(/\/$/, '')
    : file;
  if (path.startsWith('..')) return `link ${target} points outside the repository`;
  if (rawPath && !repo.exists(path)) return `link ${target} points to a missing file`;
  if (anchor && path.endsWith('.md') && !slugsFor(path).has(safeDecode(anchor))) {
    return `link ${target} has no matching heading`;
  }
  return null;
}

function checkLinks(file: string, parsed: ParsedMarkdown, repo: DocsRepo): DocsProblem[] {
  const slugCache = new Map<string, Set<string>>();
  const slugsFor = (path: string) => {
    let slugs = slugCache.get(path);
    if (!slugs) {
      slugs = headingSlugs(parseMarkdown(repo.readText(path)).headings);
      slugCache.set(path, slugs);
    }
    return slugs;
  };

  return parsed.prose.flatMap(({ text, line }) =>
    linkTargets(text)
      .filter((target) => !isExternal(target))
      .map((target) => checkLinkTarget(file, target, repo, slugsFor))
      .filter((message): message is string => message !== null)
      .map((message) => ({ file, line, message })),
  );
}

function skippedPathPrefixes(content: string): string[] {
  return [...content.matchAll(SKIP_PATHS_RE)].flatMap((match) =>
    match[1]
      .split(',')
      .map((prefix) => prefix.trim())
      .filter(Boolean),
  );
}

function resolveRepoPath(token: string, repo: DocsRepo): string | null | 'skip' {
  const path = token
    .replace(/^\.\//, '')
    .replace(/[.,:;]+$/, '')
    .replace(/\/$/, '');
  if (/[<>*{}$|\s]/.test(path) || path.includes('..')) return 'skip';
  if (path.startsWith('src/')) {
    const candidates = [...repo.packageDirs.values()].map((dir) => join(dir, path));
    return candidates.find((candidate) => repo.exists(candidate)) ?? null;
  }
  if (!PATH_ROOTS.some((root) => path.startsWith(root))) return 'skip';
  if (repo.isIgnored(path)) return 'skip';
  return repo.exists(path) ? path : null;
}

function checkInlinePaths(
  file: string,
  parsed: ParsedMarkdown,
  repo: DocsRepo,
  skipped: readonly string[],
): DocsProblem[] {
  const problems: DocsProblem[] = [];
  for (const { text, line } of parsed.prose) {
    for (const match of text.matchAll(/`([^`\s]+)`/g)) {
      const token = match[1];
      if (!token.includes('/') || skipped.some((prefix) => token.startsWith(prefix))) continue;
      if (resolveRepoPath(token, repo) === null) {
        problems.push({ file, line, message: `path ${token} does not exist` });
      }
    }
  }
  return problems;
}

function blockPackageDir(block: CodeBlock, repo: DocsRepo): string | null {
  const dirs = new Set(repo.packageDirs.values());
  for (const { text } of block.lines) {
    for (const match of text.matchAll(/\bpackages\/([\w-]+)/g)) {
      const dir = `packages/${match[1]}`;
      if (dirs.has(dir)) return dir;
    }
  }
  return null;
}

/** Returns a problem message for one `bun run` invocation, or null when the script exists. */
function checkScriptName(
  flags: string,
  script: string,
  repo: DocsRepo,
  contextDir: string | null,
): string | null {
  const filter = FILTER_RE.exec(flags);
  if (filter) {
    const [, singleQuoted, doubleQuoted, bare] = filter;
    const name = singleQuoted ?? doubleQuoted ?? bare;
    // Globs such as '@quro/*' select several workspaces; the script name is not checked.
    if (/[*!?]/.test(name)) return null;
    const dir = repo.packageDirs.get(name);
    if (!dir) return `bun run --filter ${name}: no such workspace`;
    return repo.scripts.get(dir)?.has(script)
      ? null
      : `bun run ${script}: no such script in ${name}`;
  }
  const known =
    repo.scripts.get('.')?.has(script) ||
    (contextDir !== null && repo.scripts.get(contextDir)?.has(script));
  if (known) return null;
  const where = contextDir ? `the root or ${contextDir}` : 'the root package.json';
  return `bun run ${script}: no such script in ${where}`;
}

function checkBunRun(
  file: string,
  text: string,
  line: number,
  repo: DocsRepo,
  contextDir: string | null,
): DocsProblem[] {
  return [...text.matchAll(BUN_RUN_RE)]
    .filter(([, , script]) => !script.startsWith('-') && !script.includes('/'))
    .filter(([, , script]) => !/\.[cm]?[jt]sx?$/.test(script))
    .map(([, flags, script]) => checkScriptName(flags, script, repo, contextDir))
    .filter((message): message is string => message !== null)
    .map((message) => ({ file, line, message }));
}

function checkShellBlocks(
  file: string,
  parsed: ParsedMarkdown,
  repo: DocsRepo,
  isKnownConfig: (name: string) => boolean,
): DocsProblem[] {
  return parsed.blocks
    .filter((block) => SHELL_FENCES.has(block.lang))
    .flatMap((block) => {
      const contextDir = blockPackageDir(block, repo);
      return block.lines
        .filter(({ text }) => !/^\s*#/.test(text))
        .flatMap(({ text, line }) => [
          ...checkBunRun(file, text, line, repo, contextDir),
          ...[...text.matchAll(ENV_ASSIGNMENT_RE)]
            .map(([, name]) => name)
            .filter((name) => !isKnownConfig(name))
            .map((name) => ({
              file,
              line,
              message: `config ${name} is not used anywhere in the repository`,
            })),
        ]);
    });
}

function checkCommandsAndConfig(
  file: string,
  parsed: ParsedMarkdown,
  repo: DocsRepo,
): DocsProblem[] {
  const knownConfig = new Map<string, boolean>();
  const isKnownConfig = (name: string) => {
    let known = knownConfig.get(name);
    if (known === undefined) {
      known = new RegExp(`\\b${name}\\b`).test(repo.configCorpus);
      knownConfig.set(name, known);
    }
    return known;
  };
  const inlineCommands = parsed.prose.flatMap(({ text, line }) =>
    [...text.matchAll(/`([^`]*\bbun run [^`]*)`/g)].flatMap(([, command]) =>
      checkBunRun(file, command, line, repo, null),
    ),
  );
  return [...checkShellBlocks(file, parsed, repo, isKnownConfig), ...inlineCommands];
}

export function checkDocs(repo: DocsRepo): DocsProblem[] {
  return repo.markdownFiles.flatMap((file) => {
    const content = repo.readText(file);
    const parsed = parseMarkdown(content);
    const problems = checkLinks(file, parsed, repo);
    if (HISTORICAL_FILES.has(file)) return problems;
    return [
      ...problems,
      ...checkInlinePaths(file, parsed, repo, skippedPathPrefixes(content)),
      ...checkCommandsAndConfig(file, parsed, repo),
    ];
  });
}

const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

function git(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
}

export function loadRepo(root: string): DocsRepo {
  const tracked = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  const readText = (path: string) => readFileSync(join(root, path), 'utf8');
  const scripts = new Map<string, Set<string>>();
  const packageDirs = new Map<string, string>();
  for (const manifest of tracked.filter((path) =>
    /^(packages\/[^/]+\/)?package\.json$/.test(path),
  )) {
    const dir = dirname(manifest);
    const parsed = JSON.parse(readText(manifest)) as {
      name?: string;
      scripts?: Record<string, string>;
    };
    scripts.set(dir, new Set(Object.keys(parsed.scripts ?? {})));
    if (dir !== '.' && parsed.name) packageDirs.set(parsed.name, dir);
  }
  const configCorpus = tracked
    .filter(
      (path) => !path.endsWith('.md') && !/\.(png|jpe?g|gif|ico|webp|woff2?|pdf|lock)$/.test(path),
    )
    .filter((path) => existsSync(join(root, path)))
    .map(readText)
    .join('\n');
  const trackedSet = new Set(tracked);
  const trackedDirs = new Set(
    tracked.flatMap((path) => {
      const parts = path.split('/');
      return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('/'));
    }),
  );
  return {
    markdownFiles: tracked.filter((path) => path.endsWith('.md')),
    readText,
    exists: (path) => trackedSet.has(path) || trackedDirs.has(path),
    isIgnored: (path) => {
      try {
        git(root, ['check-ignore', '-q', '--no-index', path]);
        return true;
      } catch {
        return false;
      }
    },
    scripts,
    packageDirs,
    configCorpus,
  };
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..');
  const problems = checkDocs(loadRepo(root));
  for (const problem of problems) {
    console.error(
      `${relative(root, join(root, problem.file))}:${problem.line}: ${problem.message}`,
    );
  }
  if (problems.length > 0) {
    console.error(`\n${problems.length} documentation problem(s).`);
    process.exit(1);
  }
  console.log('Documentation links, paths, commands and config examples are consistent.');
}

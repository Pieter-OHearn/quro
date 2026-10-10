import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Extracts the shell commands that the docs mark as runnable, so CI runs the README quickstart
// as written instead of a copy that can drift from it.
//
// Markers are HTML comments, invisible on GitHub:
//   <!-- quickstart:begin --> ... <!-- quickstart:end -->   every bash block in between
//   <!-- quickstart:linux-only -->                           the next block runs only on Linux
//   <!-- quickstart:<name> -->                               the next block is the section <name>
//
// The only text that changes before a command runs is the release's own artifacts, which do
// not exist before the release: the example Compose file URL and the backend image reference.

export type Block = { lines: string[]; linuxOnly: boolean };

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const MARKER_RE = /^\s*<!--\s*quickstart:([\w-]+)\s*-->\s*$/;
const SHELL = new Set(['bash', 'sh', 'shell']);

type MarkedBlock = Block & { marker: string | null; region: boolean };

/** The lines of the fenced block opening at `start`, without the fence's indentation. */
function readFence(lines: readonly string[], start: number, indent: string, delimiter: string) {
  const body: string[] = [];
  let index = start + 1;
  for (; index < lines.length && lines[index]!.trim() !== delimiter; index += 1) {
    const text = lines[index]!;
    body.push(text.startsWith(indent) ? text.slice(indent.length) : text.trimStart());
  }
  return { body, end: index };
}

/** Every fenced shell block in `markdown`, with the quickstart marker that precedes it. */
function shellBlocks(markdown: string): MarkedBlock[] {
  const blocks: MarkedBlock[] = [];
  const lines = markdown.split('\n');
  let marker: string | null = null;
  let region = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const name = MARKER_RE.exec(line)?.[1];
    const fence = FENCE_RE.exec(line);
    if (name === 'begin' || name === 'end') region = name === 'begin';
    else if (name) marker = name;
    else if (fence) {
      const { body, end } = readFence(lines, index, fence[1]!, fence[2]!);
      if (SHELL.has(fence[3]!)) {
        blocks.push({ lines: body, linuxOnly: marker === 'linux-only', marker, region });
      }
      index = end;
      marker = null;
    } else if (line.trim() !== '') marker = null;
  }
  return blocks;
}

/** The shell blocks between `<!-- quickstart:begin -->` and `<!-- quickstart:end -->`. */
export function quickstartBlocks(markdown: string): Block[] {
  return shellBlocks(markdown)
    .filter((block) => block.region)
    .map(({ lines, linuxOnly }) => ({ lines, linuxOnly }));
}

/** The one shell block marked `<!-- quickstart:<name> -->`. */
export function namedBlock(markdown: string, name: string): Block {
  const found = shellBlocks(markdown).filter((block) => block.marker === name);
  if (found.length !== 1) {
    throw new Error(`expected one block marked quickstart:${name}, found ${found.length}`);
  }
  return { lines: found[0]!.lines, linuxOnly: false };
}

/** The image tag the example Compose file pins, for example `v0.8.0`. */
export function exampleTag(composeYaml: string): string {
  const tags = [...composeYaml.matchAll(/ghcr\.io\/pieter-ohearn\/quro-[a-z]+:([^\s@'"]+)/g)].map(
    (match) => match[1]!,
  );
  const unique = [...new Set(tags)];
  if (unique.length !== 1)
    throw new Error(`expected one Quro image tag, found ${unique.join(', ')}`);
  return unique[0]!;
}

export type Substitutions = { tag: string; composeFile: string; backendImage: string };

const RELEASE_URL_RE =
  /https:\/\/raw\.githubusercontent\.com\/Pieter-OHearn\/quro\/([^/\s]+)\/docs\/compose\.example\.yaml/g;
const BACKEND_IMAGE_RE = /ghcr\.io\/pieter-ohearn\/quro-backend:([^\s@'"]+)/g;

/**
 * Replaces the release's artifacts with the ones under test. Every release URL and image in the
 * commands must name the tag the example Compose file pins, so a stale version fails here.
 */
export function substitute(script: string, { tag, composeFile, backendImage }: Substitutions) {
  const problems: string[] = [];
  const replaced = script
    .replace(RELEASE_URL_RE, (_url, ref: string) => {
      if (ref !== tag) problems.push(`the download names ${ref}, the example pins ${tag}`);
      return `file://${composeFile}`;
    })
    .replace(BACKEND_IMAGE_RE, (_image, ref: string) => {
      if (ref !== tag) problems.push(`the backend image is ${ref}, the example pins ${tag}`);
      return backendImage;
    });
  if (/ghcr\.io|githubusercontent/.test(replaced)) {
    problems.push('a command still refers to a published artifact this test cannot substitute');
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return replaced;
}

/** A POSIX shell script for the blocks; Linux-only blocks are left out elsewhere. */
export function toScript(blocks: readonly Block[], onLinux: boolean): string {
  const body = blocks
    .filter((block) => onLinux || !block.linuxOnly)
    .map((block) => block.lines.join('\n'))
    .join('\n');
  return `set -eux\n${body}\n`;
}

// Usage: bun scripts/quickstart/commands.ts <quickstart|uninstall-keep|uninstall-delete> <backend image>
if (import.meta.main) {
  const [section, backendImage] = process.argv.slice(2);
  const repo = join(import.meta.dir, '../..');
  const read = (path: string) => readFileSync(join(repo, path), 'utf8');
  const composeFile = join(repo, 'docs/compose.example.yaml');
  if (!section || !backendImage) {
    console.error('Usage: commands.ts <section> <backend image>');
    process.exit(2);
  }
  const blocks =
    section === 'quickstart'
      ? quickstartBlocks(read('README.md'))
      : [namedBlock(read('docs/uninstall.md'), section)];
  const script = toScript(blocks, process.platform === 'linux');
  const tag = exampleTag(read('docs/compose.example.yaml'));
  process.stdout.write(substitute(script, { tag, composeFile, backendImage }));
}

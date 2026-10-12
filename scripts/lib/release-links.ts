// Release notes are CHANGELOG.md text shown on a GitHub release page, where a relative link
// has nothing to resolve against. CHANGELOG.md keeps relative links so `bun run docs:check`
// can validate them; this turns the ones that point into the repository into absolute URLs
// pinned to the release tag, in the notes only.
//
// Rewritten: inline links and images, and reference definitions (`[label]: path`), whose
// destination is a repository path. Left alone: anchors-only (`#section`), anything with a
// scheme (`https:`, `mailto:`), protocol-relative `//host`, a destination that climbs above
// the repository root, and everything inside code spans and fenced code blocks. Raw HTML
// (`<a href>`, `<img src>`) is not rewritten. A fence inside a block quote and an indented code
// block (four spaces) are not recognised as code, so their links are rewritten. A reference
// definition cannot tell whether it serves a link or an image, so it always gets a `blob` URL.

export type LinkBase = {
  // Scheme and host of the forge, e.g. https://github.com
  origin: string;
  // owner/name
  repository: string;
  // The release tag, e.g. v0.9.0
  tag: string;
};

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const OPENING_FENCE = /^[ \t]*(`{3,}|~{3,})([^\n]*)$/;
const CLOSING_FENCE = /^[ \t]*(`{3,}|~{3,})\s*$/;
const REFERENCE_DEFINITION = /^( {0,3}\[(?:[^\]\\]|\\.)+\]:[ \t]*)(<[^<>]*>|[^\s<]\S*)([^\n]*)$/;
const BLANK_LINE = /\n[ \t]*\n/g;
const ESCAPE_LENGTH = 2;
const TITLE_OPENERS = '"\'(';

// A repository path with "." and ".." segments resolved against the repository root, or null
// when it climbs above the root or names the root itself.
function normalizeRepositoryPath(path: string): string | null {
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  if (segments.length === 0) return null;
  return segments.join('/') + (path.endsWith('/') ? '/' : '');
}

function absoluteDestination(destination: string, base: LinkBase, image: boolean): string {
  if (destination === '' || destination.startsWith('#')) return destination;
  if (destination.startsWith('//') || SCHEME.test(destination)) return destination;
  const suffixAt = destination.search(/[?#]/);
  const path = suffixAt < 0 ? destination : destination.slice(0, suffixAt);
  const suffix = suffixAt < 0 ? '' : destination.slice(suffixAt);
  // CHANGELOG.md sits at the repository root, so a leading "/" and no slash agree.
  const resolved = normalizeRepositoryPath(path.startsWith('/') ? path.slice(1) : path);
  if (resolved === null) return destination;
  // `raw` redirects to the file's bytes, which an <img> needs; `blob` is the file's page.
  const view = image ? 'raw' : 'blob';
  return `${base.origin}/${base.repository}/${view}/${base.tag}/${resolved}${suffix}`;
}

// The end of the paragraph that contains `from`: inline syntax never spans a blank line.
function paragraphEnd(text: string, from: number): number {
  BLANK_LINE.lastIndex = from;
  const match = BLANK_LINE.exec(text);
  return match ? match.index : text.length;
}

function backtickRunLength(text: string, at: number): number {
  let length = 0;
  while (text[at + length] === '`') length += 1;
  return length;
}

// The index just past the code span that opens with the backtick run at `at`, or null when
// the run has no closing run of the same length in its paragraph (then it is literal ticks).
function codeSpanEnd(text: string, at: number, end: number): number | null {
  const length = backtickRunLength(text, at);
  let index = at + length;
  while (index < end) {
    const run = text[index] === '`' ? backtickRunLength(text, index) : 0;
    if (run === length) return index + run;
    index += Math.max(run, 1);
  }
  return null;
}

// The index after text that is not link syntax and must be copied as is (a backslash escape,
// a code span or a run of literal backticks) when it starts at `at`; null for anything else.
function literalEnd(text: string, at: number): number | null {
  if (text[at] === '\\') return at + ESCAPE_LENGTH;
  if (text[at] !== '`') return null;
  return codeSpanEnd(text, at, paragraphEnd(text, at)) ?? at + backtickRunLength(text, at);
}

// The index of the "]" that closes the "[" at `open`, or null.
function closingBracket(text: string, open: number): number | null {
  const end = paragraphEnd(text, open);
  let depth = 0;
  let index = open;
  while (index < end) {
    const skipped = literalEnd(text, index);
    if (skipped !== null) {
      index = skipped;
      continue;
    }
    if (text[index] === '[') depth += 1;
    if (text[index] === ']') depth -= 1;
    if (depth === 0) return index;
    index += 1;
  }
  return null;
}

type InlineDestination = { start: number; end: number; angle: boolean; close: number };

function skipWhitespace(text: string, from: number): number {
  let index = from;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

// The index after the optional title that starts at `at` ("t", 't' or (t)), or null when
// it is malformed.
function titleEnd(text: string, at: number): number | null {
  const closer = text[at] === '(' ? ')' : text[at];
  let index = at + 1;
  while (index < text.length) {
    if (text[index] === closer) return index + 1;
    index += text[index] === '\\' ? ESCAPE_LENGTH : 1;
  }
  return null;
}

// The end of an angle-bracket destination whose "<" is at `open`, or null.
function angleDestinationEnd(text: string, open: number): number | null {
  let index = open + 1;
  while (index < text.length && text[index] !== '>' && text[index] !== '\n') {
    if (text[index] === '<') return null;
    index += text[index] === '\\' ? ESCAPE_LENGTH : 1;
  }
  return text[index] === '>' ? index : null;
}

// The end of a bare destination from `from`: it stops at whitespace or at the ")" that
// closes the link, and may hold balanced parentheses.
function bareDestinationEnd(text: string, from: number): number {
  let depth = 0;
  let index = from;
  while (index < text.length && !/\s/.test(text[index])) {
    if (text[index] === '\\') {
      index += ESCAPE_LENGTH;
      continue;
    }
    if (text[index] === ')' && depth === 0) break;
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') depth -= 1;
    index += 1;
  }
  return index;
}

// Reads `destination "title")` after the "(" at `paren`.
function inlineDestination(text: string, paren: number): InlineDestination | null {
  const first = skipWhitespace(text, paren + 1);
  const angle = text[first] === '<';
  const start = angle ? first + 1 : first;
  const end = angle ? angleDestinationEnd(text, first) : bareDestinationEnd(text, first);
  if (end === null) return null;
  let index = skipWhitespace(text, angle ? end + 1 : end);
  if (TITLE_OPENERS.includes(text[index] ?? '')) {
    const afterTitle = titleEnd(text, index);
    if (afterTitle === null) return null;
    index = skipWhitespace(text, afterTitle);
  }
  return text[index] === ')' ? { start, end, angle, close: index } : null;
}

type Rewritten = { text: string; next: number };

// The link or image whose "[" is at `open` (`image` when a "!" precedes it), rewritten, or
// null when no closing bracket matches.
function rewriteBracket(
  text: string,
  open: number,
  image: boolean,
  base: LinkBase,
): Rewritten | null {
  const close = closingBracket(text, open);
  if (close === null) return null;
  // The label can hold an image, as in [![alt](a.png)](page.md).
  let out = `${image ? '!' : ''}[${rewriteInline(text.slice(open + 1, close), base)}]`;
  const destination = text[close + 1] === '(' ? inlineDestination(text, close + 1) : null;
  if (!destination) return { text: out, next: close + 1 };
  let rewritten = absoluteDestination(text.slice(destination.start, destination.end), base, image);
  if (destination.angle) rewritten = rewritten.replace(/ /g, '%20');
  out += text.slice(close + 1, destination.start);
  out += rewritten;
  out += text.slice(destination.end, destination.close + 1);
  return { text: out, next: destination.close + 1 };
}

function rewriteInline(text: string, base: LinkBase): string {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const skipped = literalEnd(text, index);
    if (skipped !== null) {
      out += text.slice(index, skipped);
      index = skipped;
      continue;
    }
    const image = text[index] === '!' && text[index + 1] === '[';
    const bracket =
      image || text[index] === '['
        ? rewriteBracket(text, image ? index + 1 : index, image, base)
        : null;
    out += bracket ? bracket.text : text[index];
    index = bracket ? bracket.next : index + 1;
  }
  return out;
}

function rewriteDefinition(line: string, base: LinkBase): string {
  const match = REFERENCE_DEFINITION.exec(line);
  if (!match) return line;
  const [, label, destination, rest] = match;
  const angle = destination.startsWith('<');
  const bare = angle ? destination.slice(1, destination.length - 1) : destination;
  const rewritten = absoluteDestination(bare, base, false);
  return `${label}${angle ? `<${rewritten.replace(/ /g, '%20')}>` : rewritten}${rest}`;
}

export function absoluteRepositoryLinks(markdown: string, base: LinkBase): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let fence: { char: string; length: number } | null = null;
  const flush = () => {
    if (paragraph.length === 0) return;
    out.push(rewriteInline(paragraph.join('\n'), base));
    paragraph = [];
  };
  for (const line of markdown.split('\n')) {
    if (fence) {
      out.push(line);
      const closing = CLOSING_FENCE.exec(line);
      if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    const [, marker = '', info = ''] = OPENING_FENCE.exec(line) ?? [];
    // The info string of a backtick fence cannot hold a backtick; otherwise it is a code span.
    if (marker && !(marker[0] === '`' && info.includes('`'))) {
      flush();
      out.push(line);
      fence = { char: marker[0], length: marker.length };
    } else if (REFERENCE_DEFINITION.test(line)) {
      flush();
      out.push(rewriteDefinition(line, base));
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return out.join('\n');
}

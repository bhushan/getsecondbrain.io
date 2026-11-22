export interface ScannedLink {
  /** Link target as written, without alias, heading or `.md`. */
  ref: string;
  embed: boolean;
}

export interface ScanResult {
  /** Raw text between the opening and closing `---` lines, or null. */
  frontmatter: string | null;
  /** Distinct targets, in order of first appearance. */
  links: ScannedLink[];
  /** Distinct lowercase tags, sorted. */
  tags: string[];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const WIKILINK = /(!?)\[\[([^\[\]\n]+?)\]\]/g;
const INLINE_CODE = /(`+)[^\n]*?\1/g;
const TAG = /(^|[\s(\[{>,;])#([\p{L}\p{N}_/-]+)/gu;

interface Body {
  frontmatter: string | null;
  /** Index of the first line after the frontmatter. */
  start: number;
  lines: string[];
}

function splitFrontmatter(text: string): Body {
  const lines = text.split("\n");
  if (lines[0]?.trimEnd() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]!.trimEnd() === "---") return { frontmatter: lines.slice(1, i).join("\n"), start: i + 1, lines };
    }
  }
  return { frontmatter: null, start: 0, lines };
}

/** Calls `visit` with the index of every body line that is not inside a fenced code block. */
function forEachProseLine(body: Body, visit: (index: number) => void): void {
  let fence: { char: string; length: number } | null = null;
  for (let i = body.start; i < body.lines.length; i++) {
    const line = body.lines[i]!;
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence.char && marker.length >= fence.length && line.trim() === marker) fence = null;
      continue;
    }
    if (marker) {
      fence = { char: marker[0]!, length: marker.length };
      continue;
    }
    visit(i);
  }
}

/**
 * Extracts wikilinks, tags and frontmatter in one pass over the lines of a note.
 * Linear in the note's length; skips fenced and inline code.
 */
export function scanMarkdown(text: string): ScanResult {
  const body = splitFrontmatter(text);
  const links = new Map<string, ScannedLink>();
  const tags = new Set<string>(body.frontmatter === null ? [] : frontmatterTags(body.frontmatter));

  forEachProseLine(body, (index) => {
    const line = body.lines[index]!;
    const prose = line.includes("`") ? line.replace(INLINE_CODE, " ") : line;

    if (prose.includes("[[")) {
      for (const match of prose.matchAll(WIKILINK)) {
        const ref = linkTarget(match[2]!);
        if (!ref) continue;
        const embed = match[1] === "!";
        const seen = links.get(ref);
        if (seen) seen.embed ||= embed;
        else links.set(ref, { ref, embed });
      }
    }

    if (prose.includes("#")) {
      for (const match of prose.replace(WIKILINK, " ").matchAll(TAG)) {
        const tag = normalizeTag(match[2]!);
        if (tag) tags.add(tag);
      }
    }
  });

  return { frontmatter: body.frontmatter, links: [...links.values()], tags: [...tags].sort() };
}

/** A wikilink on one line, with offsets into that line, for editors that style links in place. */
export interface LineLink {
  /** From the `!` or the first `[` to just after the closing `]]`. */
  from: number;
  to: number;
  target: string;
  /** The text a reader sees: the alias after `|`, otherwise what is written inside the brackets. */
  label: string;
  labelFrom: number;
  labelTo: number;
  embed: boolean;
}

/** Wikilinks on one line of prose, skipping inline code. Same rules as `scanMarkdown`. */
export function wikilinksInLine(line: string): LineLink[] {
  if (!line.includes("[[")) return [];
  const prose = line.includes("`") ? line.replace(INLINE_CODE, (code) => " ".repeat(code.length)) : line;
  const found: LineLink[] = [];
  for (const match of prose.matchAll(WIKILINK)) {
    const inner = match[2]!;
    const target = linkTarget(inner);
    if (!target) continue;
    const from = match.index;
    const innerFrom = from + match[1]!.length + 2;
    const pipe = inner.indexOf("|");
    const labelFrom = pipe === -1 ? innerFrom : innerFrom + pipe + 1;
    const labelTo = innerFrom + inner.length;
    found.push({ from, to: from + match[0].length, target, label: line.slice(labelFrom, labelTo), labelFrom, labelTo, embed: match[1] === "!" });
  }
  return found;
}

/** Characters taken by a leading frontmatter block (both `---` lines and the newline after), or 0. */
export function frontmatterLength(text: string): number {
  const body = splitFrontmatter(text);
  if (body.frontmatter === null) return 0;
  return body.lines.slice(0, body.start).join("\n").length + (body.start < body.lines.length ? 1 : 0);
}

/**
 * Rewrites wikilink targets, keeping each link's alias, heading and embed marker.
 * `rename` gets a target as `scanMarkdown` reports it and returns the new target, or null to leave it.
 */
export function rewriteLinks(text: string, rename: (ref: string) => string | null): string {
  const body = splitFrontmatter(text);
  let changed = false;

  const rewrite = (prose: string) =>
    prose.replace(WIKILINK, (whole, bang: string, inner: string) => {
      const next = rename(linkTarget(inner));
      if (next === null) return whole;
      const cut = inner.search(/[#|]/);
      changed = true;
      return `${bang}[[${next}${cut === -1 ? "" : inner.slice(cut)}]]`;
    });

  forEachProseLine(body, (index) => {
    const line = body.lines[index]!;
    if (!line.includes("[[")) return;
    if (!line.includes("`")) {
      body.lines[index] = rewrite(line);
      return;
    }
    // Leave inline code untouched: rewrite only the text between code spans.
    let out = "";
    let last = 0;
    for (const code of line.matchAll(INLINE_CODE)) {
      out += rewrite(line.slice(last, code.index)) + code[0];
      last = code.index + code[0].length;
    }
    body.lines[index] = out + rewrite(line.slice(last));
  });

  return changed ? body.lines.join("\n") : text;
}

function linkTarget(inner: string): string {
  let target = inner;
  const pipe = target.indexOf("|");
  if (pipe !== -1) target = target.slice(0, pipe);
  const hash = target.indexOf("#");
  if (hash !== -1) target = target.slice(0, hash);
  target = target.trim();
  if (target.toLowerCase().endsWith(".md")) target = target.slice(0, -3);
  return target;
}

/** A tag needs at least one character that is not a digit, so `#123` is not a tag. */
function normalizeTag(raw: string): string | null {
  const tag = raw.replace(/^#/, "").replace(/\/+$/, "").toLowerCase();
  return tag && /[^\d/_-]/.test(tag) ? tag : null;
}

/** Reads `tags:` from frontmatter, as an inline list, a block list, or a single value. */
function frontmatterTags(frontmatter: string): string[] {
  const lines = frontmatter.split("\n");
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^tags?:\s*(.*)$/i.exec(lines[i]!);
    if (!match) continue;
    const value = match[1]!.trim();
    if (value) {
      found.push(...value.replace(/^\[|\]$/g, "").split(","));
    } else {
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s*-\s+(.*)$/.exec(lines[j]!);
        if (!item) break;
        found.push(item[1]!);
      }
    }
    break;
  }
  return found
    .map((tag) => normalizeTag(tag.trim().replace(/^["']|["']$/g, "")))
    .filter((tag): tag is string => tag !== null);
}

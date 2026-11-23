import { wikilinksInLine } from "../worker/lib/markdown";

/**
 * Reading GitHub-flavored markdown tables for the editor's live preview. Plain strings in, plain data
 * out: no DOM and no CodeMirror, so the rules are unit tested. The parser decides what is a table;
 * this only splits it into cells and reads the inline formatting inside a cell.
 */

export type Align = "left" | "center" | "right" | null;

/** A cell's text (escaped pipes already turned into pipes) and where that text starts in the source. */
export interface TableCell {
  text: string;
  at: number;
}

export interface Table {
  align: Align[];
  header: TableCell[];
  rows: TableCell[][];
}

export type InlinePart =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong" | "em" | "strike"; parts: InlinePart[] }
  | { kind: "link"; href: string; parts: InlinePart[] }
  | { kind: "wikilink"; target: string; label: string; embed: boolean };

export interface Span {
  from: number;
  to: number;
}

/** Splits one table line into cells. Offsets are relative to the line. */
export function splitTableRow(line: string): TableCell[] {
  const cells: TableCell[] = [];
  let i = 0;
  while (i < line.length && /\s/.test(line[i]!)) i++;
  if (line[i] === "|") i++;
  let text = "";
  let start = i;
  const finish = () => {
    const lead = text.length - text.trimStart().length;
    cells.push({ text: text.trim(), at: start + lead });
  };
  for (; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "\\" && line[i + 1] === "|") {
      text += "|";
      i++;
    } else if (ch === "|") {
      finish();
      text = "";
      start = i + 1;
    } else {
      text += ch;
    }
  }
  // A trailing pipe closes the last cell rather than opening an empty one.
  if (text.trim() !== "" || cells.length === 0) finish();
  return cells;
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/** Reads a whole table (header, alignment row, body). Cell offsets are relative to `source`. */
export function parseTable(source: string): Table {
  const lines = source.split("\n");
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  const row = (n: number) => splitTableRow(lines[n] ?? "").map((cell) => ({ text: cell.text, at: cell.at + offsets[n]! }));
  const header = row(0);
  const width = header.length;
  const delimiter = splitTableRow(lines[1] ?? "");
  const align = header.map((_, i) => alignOf((delimiter[i]?.text ?? "").replace(/\s+/g, "")));
  const fit = (cells: TableCell[], n: number) =>
    Array.from({ length: width }, (_, i) => cells[i] ?? { text: "", at: offsets[n]! + (lines[n]?.length ?? 0) });
  const rows: TableCell[][] = [];
  for (let n = 2; n < lines.length; n++) if (lines[n]!.trim() !== "") rows.push(fit(row(n), n));
  return { align, header, rows };
}

const PUNCTUATION = /[!-/:-@[-`{-~]/;

/** Reads the inline markdown of one cell: code, bold, italic, strikethrough, links and wikilinks. */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let plain = "";
  const push = (part: InlinePart) => {
    if (plain) parts.push({ kind: "text", text: plain });
    plain = "";
    parts.push(part);
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const ch = text[i]!;
    const before = i > 0 ? text[i - 1]! : " ";

    if (ch === "\\" && i + 1 < text.length && PUNCTUATION.test(text[i + 1]!)) {
      plain += text[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      const run = /^`+/.exec(rest)![0];
      const close = new RegExp(`(?<!\`)${run}(?!\`)`, "g");
      close.lastIndex = run.length;
      const end = close.exec(rest);
      if (end) {
        let code = rest.slice(run.length, end.index);
        if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ")) code = code.slice(1, -1);
        push({ kind: "code", text: code });
        i += end.index + run.length;
      } else {
        plain += run;
        i += run.length;
      }
      continue;
    }

    if (rest.startsWith("[[") || rest.startsWith("![[")) {
      const link = wikilinksInLine(rest)[0];
      if (link && link.from === 0) {
        push({ kind: "wikilink", target: link.target, label: link.label, embed: link.embed });
        i += link.to;
        continue;
      }
    }

    if (ch === "[") {
      const link = /^\[([^\]]+)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/.exec(rest);
      if (link) {
        push({ kind: "link", href: link[2]!, parts: inlineParts(link[1]!) });
        i += link[0].length;
        continue;
      }
    }

    if ((ch === "h" || ch === "H") && !/[\w/]/.test(before)) {
      const url = /^https?:\/\/[^\s<]+/i.exec(rest);
      if (url) {
        const href = url[0].replace(/[.,;:!?)'"]+$/, "");
        push({ kind: "link", href, parts: [{ kind: "text", text: href }] });
        i += href.length;
        continue;
      }
    }

    const pair = rest.startsWith("**") || rest.startsWith("__") || rest.startsWith("~~") ? rest.slice(0, 2) : null;
    const single = !pair && (ch === "*" || ch === "_") ? ch : null;
    const mark = pair ?? single;
    if (mark && !/\s/.test(text[i + mark.length] ?? " ") && !(mark.startsWith("_") && /[\p{L}\p{N}]/u.test(before))) {
      const close = findClose(text, i + mark.length, mark);
      if (close !== -1) {
        const kind = mark === "~~" ? "strike" : pair ? "strong" : "em";
        push({ kind, parts: inlineParts(text.slice(i + mark.length, close)) });
        i = close + mark.length;
        continue;
      }
    }

    plain += ch;
    i++;
  }
  if (plain) parts.push({ kind: "text", text: plain });
  return parts;
}

/** The closing marker for an emphasis that opened at `from`, or -1. Skips code spans on the way. */
function findClose(text: string, from: number, mark: string): number {
  for (let j = from + 1; j <= text.length - mark.length; j++) {
    if (text[j] === "`") {
      const end = text.indexOf("`", j + 1);
      if (end !== -1) j = end;
      continue;
    }
    if (!text.startsWith(mark, j) || /\s/.test(text[j - 1]!)) continue;
    // A single * or _ must not be half of a double one.
    if (mark.length === 1 && (text[j + 1] === mark || text[j - 1] === mark)) continue;
    if (mark.startsWith("_") && /[\p{L}\p{N}]/u.test(text[j + mark.length] ?? "")) continue;
    return j;
  }
  return -1;
}

/**
 * Which tables are drawn as a table. While the editor has focus, a table the cursor or a selection
 * touches (its edges included) shows its raw markdown instead, so it can be edited.
 */
export function renderedTables(tables: Span[], selection: readonly Span[], focused: boolean): Span[] {
  if (!focused) return tables;
  return tables.filter((table) => !selection.some((range) => range.from <= table.to && range.to >= table.from));
}

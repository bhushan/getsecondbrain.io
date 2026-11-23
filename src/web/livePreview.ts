import { syntaxTree } from "@codemirror/language";
import { type EditorState, Prec, type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { frontmatterLength, wikilinksInLine } from "../worker/lib/markdown";
import { type InlinePart, inlineParts, parseTable, renderedTables, type Span, type TableCell } from "./markdownTable";

/**
 * Live preview, the way Obsidian does it: markdown reads as formatted text, and the raw markers come
 * back on the lines the cursor is on. Decorations only; the document text is never changed by it.
 */

const hidden = Decoration.replace({});

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-bullet";
    dot.textContent = "•";
    return dot;
  }
}

class TaskWidget extends WidgetType {
  constructor(
    readonly done: boolean,
    readonly at: number,
  ) {
    super();
  }
  eq(other: TaskWidget) {
    return other.done === this.done && other.at === this.at;
  }
  toDOM(view: EditorView) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-task";
    box.checked = this.done;
    box.setAttribute("aria-label", this.done ? "Mark as not done" : "Mark as done");
    box.addEventListener("mousedown", (event) => event.preventDefault());
    box.addEventListener("click", () => {
      view.dispatch({ changes: { from: this.at + 1, to: this.at + 2, insert: this.done ? " " : "x" } });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

/** Lines the cursor or a selection touches while the editor has focus: those show their raw markdown. */
function activeLines(state: EditorState, focused: boolean): Set<number> {
  const lines = new Set<number>();
  if (!focused) return lines;
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
}

const CODE_NODES = new Set(["FencedCode", "CodeBlock", "InlineCode", "CodeText", "HTMLBlock", "CommentBlock"]);

function build(view: EditorView, frontmatterEnd: number, tables: Tables): DecorationSet {
  const { state } = view;
  const active = activeLines(state, view.hasFocus);
  // A table being edited shows all of its rows raw, so its pipes line up with the rows around them.
  for (const table of tables.raw) {
    const last = state.doc.lineAt(table.to).number;
    for (let n = state.doc.lineAt(table.from).number; n <= last; n++) active.add(n);
  }
  const renderedAt = (pos: number) => tables.rendered.find((table) => pos >= table.from && pos <= table.to);
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const out: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  // Frontmatter: kept as plain source in a quiet block, never read as headings or rules.
  if (frontmatterEnd > 0) {
    const last = state.doc.lineAt(Math.max(0, frontmatterEnd - 1)).number;
    for (let n = 1; n <= last; n++) out.push(Decoration.line({ class: "cm-frontmatter" }).range(state.doc.line(n).from));
  }

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from: Math.max(from, frontmatterEnd),
      to,
      enter: (node) => {
        if (node.from < frontmatterEnd) return;
        const name = node.name;
        const line = state.doc.lineAt(node.from);
        const raw = active.has(line.number);
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (heading) {
          out.push(Decoration.line({ class: `cm-h cm-h${heading[1]}` }).range(line.from));
          return;
        }
        switch (name) {
          case "Table": {
            // A rendered table is one widget, drawn by the table field below.
            if (renderedAt(node.from)) return false;
            const end = state.doc.lineAt(node.to).number;
            for (let n = line.number; n <= end; n++) out.push(Decoration.line({ class: "cm-table-line" }).range(state.doc.line(n).from));
            return;
          }
          case "HeaderMark": {
            if (raw || state.doc.sliceString(node.from, node.to).startsWith("=") || state.doc.sliceString(node.from, node.to).startsWith("-")) return;
            // An ATX mark: hide it with the space that follows.
            const after = state.doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
            if (node.from === line.from) out.push(hidden.range(node.from, after));
            else out.push(hidden.range(node.from, node.to)); // closing #s
            return;
          }
          case "EmphasisMark":
          case "StrikethroughMark":
            if (!raw) out.push(hidden.range(node.from, node.to));
            return;
          case "CodeMark": {
            const parent = node.node.parent?.name;
            if (parent === "InlineCode" && !raw) out.push(hidden.range(node.from, node.to));
            return;
          }
          case "InlineCode":
            out.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
            return;
          case "FencedCode":
          case "CodeBlock": {
            const end = state.doc.lineAt(node.to).number;
            for (let n = line.number; n <= end; n++) out.push(Decoration.line({ class: "cm-codeblock" }).range(state.doc.line(n).from));
            return false;
          }
          case "Blockquote": {
            const end = state.doc.lineAt(node.to).number;
            for (let n = line.number; n <= end; n++) out.push(Decoration.line({ class: "cm-quote" }).range(state.doc.line(n).from));
            return;
          }
          case "QuoteMark":
            if (!raw) {
              const after = state.doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
              out.push(hidden.range(node.from, after));
            }
            return;
          case "HorizontalRule":
            out.push(Decoration.line({ class: "cm-hr" }).range(line.from));
            if (!raw) out.push(hidden.range(node.from, node.to));
            return;
          case "ListMark": {
            const mark = state.doc.sliceString(node.from, node.to);
            const task = state.doc.sliceString(node.to, node.to + 5);
            if (raw || !/^[-*+]$/.test(mark) || /^ \[[ xX]\]/.test(task)) return;
            out.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
            return;
          }
          case "TaskMarker": {
            if (raw) return;
            const done = /x/i.test(state.doc.sliceString(node.from, node.to));
            // Hide the list dash with the box, so a task reads as just a checkbox.
            const dash = node.node.parent?.parent?.getChild("ListMark");
            const start = dash && dash.to + 1 === node.from ? dash.from : node.from;
            out.push(Decoration.replace({ widget: new TaskWidget(done, node.from) }).range(start, node.to));
            if (done) out.push(Decoration.line({ class: "cm-task-done" }).range(line.from));
            return;
          }
          case "Link": {
            const marks = node.node.getChildren("LinkMark");
            const url = node.node.getChild("URL");
            if (marks.length < 2) return;
            const textFrom = marks[0]!.to;
            const textTo = marks[1]!.from;
            const href = url ? state.doc.sliceString(url.from, url.to) : "";
            if (textTo > textFrom) out.push(Decoration.mark({ class: "cm-md-link", attributes: { "data-href": href } }).range(textFrom, textTo));
            if (!raw && textTo > textFrom) {
              out.push(hidden.range(node.from, textFrom));
              out.push(hidden.range(textTo, node.to));
            }
            return false;
          }
        }
      },
    });

    // Wikilinks are not part of CommonMark, so they come from the same scanner the server uses.
    for (let pos = Math.max(from, frontmatterEnd); pos <= to; ) {
      const line = state.doc.lineAt(pos);
      const table = renderedAt(line.from);
      if (table) {
        pos = table.to + 1;
        continue;
      }
      if (line.text.includes("[[")) {
        for (const link of wikilinksInLine(line.text)) {
          const start = line.from + link.from;
          const inside = tree.resolveInner(start + 2, 1);
          let code = false;
          for (let at: typeof inside | null = inside; at; at = at.parent) if (CODE_NODES.has(at.name)) code = true;
          if (code) continue;
          const attributes = { "data-target": link.target };
          if (isActive(start)) {
            out.push(Decoration.mark({ class: "cm-wikilink cm-wikilink-raw", attributes }).range(start, line.from + link.to));
          } else {
            out.push(hidden.range(start, line.from + link.labelFrom));
            out.push(Decoration.mark({ class: link.embed ? "cm-wikilink cm-embed" : "cm-wikilink", attributes }).range(line.from + link.labelFrom, line.from + link.labelTo));
            out.push(hidden.range(line.from + link.labelTo, line.from + link.to));
          }
        }
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(out, true);
}

/** Top-level tables, and which of them are drawn as a table or left as raw markdown. */
interface Tables {
  rendered: Span[];
  raw: Span[];
  focused: boolean;
  frontmatterEnd: number;
  decorations: DecorationSet;
}

const focusChanged = StateEffect.define<boolean>();

/** Tables straight under the document. One inside a quote or a list stays raw markdown. */
function tableSpans(state: EditorState, frontmatterEnd: number): Span[] {
  const spans: Span[] = [];
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "Table" || node.from < frontmatterEnd) continue;
    spans.push({ from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(Math.max(node.from, node.to - 1)).to });
  }
  return spans;
}

function appendParts(parent: HTMLElement, parts: InlinePart[]) {
  for (const part of parts) {
    switch (part.kind) {
      case "text":
        parent.append(part.text);
        break;
      case "code": {
        const code = document.createElement("code");
        code.className = "cm-inline-code";
        code.textContent = part.text;
        parent.append(code);
        break;
      }
      case "strong":
      case "em":
      case "strike": {
        const el = document.createElement(part.kind === "strike" ? "s" : part.kind);
        appendParts(el, part.parts);
        parent.append(el);
        break;
      }
      case "link": {
        const link = document.createElement("span");
        link.className = "cm-md-link";
        link.dataset.href = part.href;
        appendParts(link, part.parts);
        parent.append(link);
        break;
      }
      case "wikilink": {
        const link = document.createElement("span");
        link.className = part.embed ? "cm-wikilink cm-embed" : "cm-wikilink";
        link.dataset.target = part.target;
        link.textContent = part.label;
        parent.append(link);
        break;
      }
    }
  }
}

/** A table drawn as HTML. A click on a cell puts the cursor in that cell's markdown; links open. */
class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly onLink: (target: string) => void,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  toDOM(view: EditorView) {
    const table = parseTable(this.source);
    const wrap = document.createElement("div");
    wrap.className = "cm-table-wrap";
    const el = document.createElement("table");
    el.className = "cm-table";
    const row = (cells: TableCell[], tag: "th" | "td") => {
      const tr = document.createElement("tr");
      cells.forEach((cell, i) => {
        const td = document.createElement(tag);
        const align = table.align[i];
        if (align) td.style.textAlign = align;
        td.dataset.at = String(cell.at);
        appendParts(td, inlineParts(cell.text));
        tr.append(td);
      });
      return tr;
    };
    const head = document.createElement("thead");
    head.append(row(table.header, "th"));
    const body = document.createElement("tbody");
    for (const cells of table.rows) body.append(row(cells, "td"));
    el.append(head, body);
    wrap.append(el);
    wrap.addEventListener("mousedown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      // The box itself is its scrollbar and padding: leave those to the browser, so a wide table can be dragged.
      if (event.button !== 0 || target === wrap) return;
      const wikilink = target?.closest<HTMLElement>(".cm-wikilink");
      const href = target?.closest<HTMLElement>(".cm-md-link")?.dataset.href ?? "";
      event.preventDefault();
      if (wikilink) return this.onLink(wikilink.dataset.target ?? "");
      if (/^https?:\/\//i.test(href)) return void window.open(href, "_blank", "noopener,noreferrer");
      const at = Number(target?.closest<HTMLElement>("[data-at]")?.dataset.at ?? 0);
      view.dispatch({ selection: { anchor: view.posAtDOM(wrap) + at } });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

function tableState(state: EditorState, focused: boolean, frontmatterEnd: number, onLink: (target: string) => void): Tables {
  const all = tableSpans(state, frontmatterEnd);
  const rendered = renderedTables(all, state.selection.ranges, focused);
  const raw = all.filter((table) => !rendered.includes(table));
  const decorations = Decoration.set(
    rendered.map((table) =>
      Decoration.replace({ widget: new TableWidget(state.doc.sliceString(table.from, table.to), onLink), block: true }).range(table.from, table.to),
    ),
  );
  return { rendered, raw, focused, frontmatterEnd, decorations };
}

/**
 * Tables are block widgets, which CodeMirror only takes from a state field. Focus is mirrored into
 * the state, so a table shows its markdown only while the editor has focus and the cursor is in it.
 */
function tableField(onLink: (target: string) => void) {
  return StateField.define<Tables>({
    create: (state) => tableState(state, false, frontmatterLength(state.doc.toString()), onLink),
    update(value, tr) {
      let focused = value.focused;
      for (const effect of tr.effects) if (effect.is(focusChanged)) focused = effect.value;
      const frontmatterEnd = tr.docChanged ? frontmatterLength(tr.state.doc.toString()) : value.frontmatterEnd;
      // A long note is parsed in steps; a table parsed later must still be drawn.
      const parsed = syntaxTree(tr.startState) !== syntaxTree(tr.state);
      if (!tr.docChanged && !tr.selection && !parsed && focused === value.focused) return value;
      return tableState(tr.state, focused, frontmatterEnd, onLink);
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
}

/** The editor extension. `onLink` gets a wikilink's target; external links open in a new tab. */
export function livePreview(onLink: (target: string) => void) {
  const tables = tableField(onLink);
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        const state = view.state.field(tables);
        this.decorations = build(view, state.frontmatterEnd, state);
      }
      update(update: ViewUpdate) {
        const state = update.state.field(tables);
        const changed = update.startState.field(tables) !== state;
        if (changed || update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
          this.decorations = build(update.view, state.frontmatterEnd, state);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
  const focus = EditorView.focusChangeEffect.of((_state, focusing) => focusChanged.of(focusing));

  // Up and Down would jump over a drawn table; stop at its edge instead, which shows its markdown.
  const enterTable = (forward: boolean) => (view: EditorView) => {
    const range = view.state.selection.main;
    if (!range.empty) return false;
    const next = view.moveVertically(range, forward).head;
    const rendered = view.state.field(tables).rendered;
    // The nearest table crossed: the first one going down, the last one going up.
    const table = forward
      ? rendered.find((t) => range.head < t.from && next > t.to)
      : rendered.findLast((t) => range.head > t.to && next < t.from);
    if (!table) return false;
    view.dispatch({ selection: { anchor: forward ? table.from : view.state.doc.lineAt(table.to).from }, scrollIntoView: true });
    return true;
  };
  const keys = Prec.high(keymap.of([
    { key: "ArrowDown", run: enterTable(true) },
    { key: "ArrowUp", run: enterTable(false) },
  ]));

  const clicks = EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target instanceof Element ? event.target : null;
      const wikilink = target?.closest<HTMLElement>(".cm-wikilink");
      const link = target?.closest<HTMLElement>(".cm-md-link");
      const modified = event.metaKey || event.ctrlKey;
      // A rendered link opens on a plain click; a link being edited needs Cmd or Ctrl.
      const rendered = (el: HTMLElement) => !el.classList.contains("cm-wikilink-raw") && !activeLines(view.state, view.hasFocus).has(view.state.doc.lineAt(view.posAtDOM(el)).number);
      if (wikilink && (modified || rendered(wikilink))) {
        event.preventDefault();
        onLink(wikilink.dataset.target ?? "");
        return true;
      }
      const href = link?.dataset.href ?? "";
      if (link && /^https?:\/\//i.test(href) && (modified || rendered(link))) {
        event.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
        return true;
      }
      return false;
    },
  });

  return [tables, focus, keys, plugin, clicks];
}

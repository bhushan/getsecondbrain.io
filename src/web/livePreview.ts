import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { frontmatterLength, wikilinksInLine } from "../worker/lib/markdown";

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

function build(view: EditorView, frontmatterEnd: number): DecorationSet {
  const { state } = view;
  const active = activeLines(state, view.hasFocus);
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

/** The editor extension. `onLink` gets a wikilink's target; external links open in a new tab. */
export function livePreview(onLink: (target: string) => void) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      frontmatterEnd: number;
      constructor(view: EditorView) {
        this.frontmatterEnd = frontmatterLength(view.state.doc.toString());
        this.decorations = build(view, this.frontmatterEnd);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.frontmatterEnd = frontmatterLength(update.state.doc.toString());
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
          this.decorations = build(update.view, this.frontmatterEnd);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );

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

  return [plugin, clicks];
}

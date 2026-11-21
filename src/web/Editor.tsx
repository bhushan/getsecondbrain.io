import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

interface Props {
  /** Changing the key replaces the document (a different note, or a reload after a conflict). */
  docKey: string;
  value: string;
  onChange(value: string): void;
  onSave(): void;
}

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px", backgroundColor: "transparent", color: "var(--ink)" },
  ".cm-scroller": { fontFamily: "var(--font-text)", lineHeight: "1.65" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--ink)" },
  ".cm-gutters": { display: "none" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--select) !important" },
  ".cm-cursor": { borderLeftColor: "var(--ink)" },
});

// Quiet markdown colouring: headings bold, links in the action colour, no underlines.
const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: [tags.link, tags.url], color: "var(--action)" },
  { tag: [tags.monospace, tags.processingInstruction, tags.meta], color: "var(--muted)" },
]);

/** Plain markdown editing: the text is the note, nothing is converted. */
export function Editor({ docKey, value, onChange, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          theme,
          syntaxHighlighting(highlight),
          keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (callbacks.current.onSave(), true) }]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    return () => view.current?.destroy();
    // Rebuilt only when the document identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  return <div className="editor" ref={host} />;
}

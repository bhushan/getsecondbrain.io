import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { livePreview } from "./livePreview";

interface Props {
  /** Changing the key replaces the document (a different note, or a reload after a conflict). */
  docKey: string;
  value: string;
  onChange(value: string): void;
  onSave(): void;
  /** A wikilink was opened (click on a rendered link, or Cmd/Ctrl+click). */
  onLink(target: string): void;
}

// Colours come from the design tokens, so the editor follows the light and dark themes with the rest of the app.
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px", backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-scroller": { fontFamily: "var(--font-sans)", lineHeight: "1.7", fontFeatureSettings: '"cv11", "ss01"' },
  ".cm-content": { padding: "16px 0 32px", caretColor: "var(--brand-violet)" },
  ".cm-gutters": { display: "none" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--brand-violet) 22%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--brand-violet)", borderLeftWidth: "2px" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--accent)", outline: "none" },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  ".cm-panels": { backgroundColor: "var(--popover)", color: "var(--foreground)", borderColor: "var(--border)" },
  ".cm-tooltip": { backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" },
});

// Quiet markdown colouring: headings larger and bold, links in the brand colour, code in mono.
const highlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "650", fontSize: "1.45em", letterSpacing: "-0.02em" },
  { tag: tags.heading2, fontWeight: "650", fontSize: "1.2em", letterSpacing: "-0.015em" },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--brand-ink)" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  { tag: [tags.processingInstruction, tags.meta, tags.quote, tags.contentSeparator], color: "var(--muted-foreground)" },
]);

/** Markdown editing with live preview: the text is the note, nothing is converted. */
export function Editor({ docKey, value, onChange, onSave, onLink }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSave, onLink });
  callbacks.current = { onChange, onSave, onLink };

  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown({ base: markdownLanguage }),
          livePreview((target) => callbacks.current.onLink(target)),
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

import { type CSSProperties, forwardRef, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./Icons";
import { ancestorsOf, buildTree, filterTree, type TreeFolder, untitledPath } from "./noteTree";
import { NotePanel, type NotePanelHandle } from "./NotePanel";

interface Props {
  version: number;
  selected: string | null;
  draftPath: string | null;
  onOpen(id: string): void;
  onOpenPath(path: string): void;
  onDraft(path: string): void;
  onClose(): void;
  onChanged(): void;
}

const OPEN_KEY = "sb.tree.open";

function readOpen(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

/** One row of the tree as it is drawn: folders and notes in reading order, for keyboard moves. */
type Row = { kind: "folder"; path: string; name: string; depth: number; count: number; open: boolean } | { kind: "note"; path: string; name: string; depth: number; id: string };

function flatten(folder: TreeFolder, isOpen: (path: string) => boolean, depth = 0, rows: Row[] = []): Row[] {
  for (const child of folder.folders) {
    const open = isOpen(child.path);
    rows.push({ kind: "folder", path: child.path, name: child.name, depth, count: child.count, open });
    if (open) flatten(child, isOpen, depth + 1, rows);
  }
  for (const note of folder.notes) rows.push({ kind: "note", path: note.path, name: note.name, depth, id: note.id });
  return rows;
}

const folderOf = (path: string | undefined) => (path && path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** The Notes page: every folder and note as a tree, and the open note in a full editor beside it. */
export const NotesPage = forwardRef<NotePanelHandle, Props>(function NotesPage({ version, selected, draftPath, onOpen, onOpenPath, onDraft, onClose, onChanged }, panelRef) {
  const [entries, setEntries] = useState<{ id: string; path: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(readOpen);
  const [naming, setNaming] = useState<string | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    let cancelled = false;
    api
      .graph()
      .then((data) => !cancelled && (setEntries(data.ids.map((id, i) => ({ id, path: data.paths[i]! }))), setError(null)))
      .catch((cause: Error) => !cancelled && setError(cause.message));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const tree = useMemo(() => buildTree(entries ?? []), [entries]);
  const untitledIn = (folder: string) => untitledPath((entries ?? []).map((entry) => entry.path), folder);
  const shown = useMemo(() => filterTree(tree, query), [tree, query]);
  const selectedPath = useMemo(() => entries?.find((entry) => entry.id === selected)?.path, [entries, selected]);

  // Reveal the open note: its folders open when it is picked from a link, the Network or search.
  useEffect(() => {
    if (!selectedPath) return;
    const needed = ancestorsOf(selectedPath).filter((path) => !open.has(path));
    if (needed.length) setOpen((current) => new Set([...current, ...needed]));
    window.requestAnimationFrame(() => rowRefs.current.get(selectedPath)?.scrollIntoView({ block: "nearest" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
    } catch {}
  }, [open]);

  const filtering = query.trim().length > 0;
  const rows = useMemo(() => (shown ? flatten(shown, (path) => filtering || open.has(path)) : []), [shown, open, filtering]);
  const current = focusPath ?? selectedPath ?? rows[0]?.path ?? null;

  const toggle = (path: string, force?: boolean) =>
    setOpen((was) => {
      const next = new Set(was);
      if (force ?? !next.has(path)) next.add(path);
      else next.delete(path);
      return next;
    });

  const focusRow = (path: string | undefined) => {
    if (!path) return;
    setFocusPath(path);
    rowRefs.current.get(path)?.focus();
  };

  // The tree follows the WAI-ARIA tree pattern: arrows move and open, Enter opens a note.
  const onKey = (event: KeyboardEvent<HTMLElement>, row: Row, index: number) => {
    const key = event.key;
    if (key === "ArrowDown") focusRow(rows[index + 1]?.path);
    else if (key === "ArrowUp") focusRow(rows[index - 1]?.path);
    else if (key === "Home") focusRow(rows[0]?.path);
    else if (key === "End") focusRow(rows[rows.length - 1]?.path);
    else if (key === "ArrowRight" && row.kind === "folder") {
      if (!row.open) toggle(row.path, true);
      else focusRow(rows[index + 1]?.path);
    } else if (key === "ArrowLeft") {
      if (row.kind === "folder" && row.open && !filtering) toggle(row.path, false);
      else focusRow(folderOf(row.path) || undefined);
    } else if (key === "Enter" || key === " ") {
      if (row.kind === "folder") toggle(row.path);
      else onOpen(row.id);
    } else return;
    event.preventDefault();
  };

  const newFolder = (name: string) => {
    const clean = name.trim().replace(/^\/+|\/+$/g, "");
    setNaming(null);
    if (clean) onDraft(untitledIn(clean));
  };

  const editing = selected !== null || draftPath !== null;
  const total = entries?.length ?? 0;

  return (
    <div className="notes-page" data-open={editing || undefined}>
      <aside className="tree-pane" aria-label="Folders and notes">
        <header className="tree-head">
          <h1>
            Notes {entries && <span className="tree-total">{total.toLocaleString()}</span>}
          </h1>
          <div className="tree-actions">
            <button className="icon" onClick={() => setNaming("")} aria-label="New folder" title="New folder">
              <Icon name="folderPlus" />
            </button>
            <button className="icon" onClick={() => onDraft(untitledIn(folderOf(selectedPath)))} aria-label="New note" title="New note">
              <Icon name="plus" />
            </button>
          </div>
        </header>
        <label className="tree-filter">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Filter by name" aria-label="Filter notes by name" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {naming !== null && (
          <form
            className="tree-naming"
            onSubmit={(event) => {
              event.preventDefault();
              newFolder(naming);
            }}
          >
            <Icon name="folder" size={16} />
            <input
              autoFocus
              placeholder="Folder name"
              aria-label="New folder name. Its first note opens next."
              value={naming}
              onChange={(event) => setNaming(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setNaming(null)}
              onBlur={() => !naming.trim() && setNaming(null)}
            />
          </form>
        )}

        <div className="tree-scroll">
          {error && <p className="tree-empty">The notes could not load: {error}</p>}
          {!error && entries === null && (
            <ul className="tree-skeleton" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <li key={i} />
              ))}
            </ul>
          )}
          {entries && total === 0 && <p className="tree-empty">No notes yet. Start one with the plus button, or connect an AI app to save them here.</p>}
          {entries && total > 0 && rows.length === 0 && <p className="tree-empty">Nothing matches “{query.trim()}”.</p>}
          {rows.length > 0 && (
            <ul className="tree" role="tree" aria-label="Notes">
              {rows.map((row, index) => {
                const tab = row.path === current ? 0 : -1;
                const ref = (el: HTMLElement | null) => {
                  if (el) rowRefs.current.set(row.path, el);
                  else rowRefs.current.delete(row.path);
                };
                const indent = { "--depth": row.depth } as CSSProperties;
                if (row.kind === "folder")
                  return (
                    <li key={`f:${row.path}`} role="none" className="tree-folder">
                      <div
                        ref={ref}
                        role="treeitem"
                        aria-expanded={filtering || row.open}
                        aria-level={row.depth + 1}
                        tabIndex={tab}
                        className="tree-row"
                        style={indent}
                        onClick={() => (setFocusPath(row.path), !filtering && toggle(row.path))}
                        onKeyDown={(event) => onKey(event, row, index)}
                      >
                        <span className="tree-chevron" data-open={filtering || row.open || undefined}>
                          <Icon name="chevron" size={14} />
                        </span>
                        <span className="tree-name">{row.name}</span>
                        <span className="tree-count">{row.count}</span>
                        <button
                          className="icon tree-add"
                          tabIndex={-1}
                          aria-label={`New note in ${row.name}`}
                          title={`New note in ${row.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggle(row.path, true);
                            onDraft(untitledIn(row.path));
                          }}
                        >
                          <Icon name="plus" size={14} />
                        </button>
                      </div>
                    </li>
                  );
                return (
                  <li key={`n:${row.id}`} role="none">
                    <div
                      ref={ref}
                      role="treeitem"
                      aria-level={row.depth + 1}
                      aria-selected={row.id === selected}
                      tabIndex={tab}
                      className="tree-row tree-note"
                      style={indent}
                      title={row.path}
                      onClick={() => (setFocusPath(row.path), onOpen(row.id))}
                      onKeyDown={(event) => onKey(event, row, index)}
                    >
                      <span className="tree-dot" aria-hidden="true" />
                      <span className="tree-name">{row.name}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="note-pane" aria-label="Editor">
        {editing ? (
          <NotePanel ref={panelRef} layout="page" noteId={selected} draftPath={draftPath} onOpen={onOpen} onOpenPath={onOpenPath} onClose={onClose} onChanged={onChanged} />
        ) : (
          <div className="note-pane-empty">
            <Icon name="note" size={28} />
            <p>Pick a note from the list, or start a new one.</p>
            <button className="primary" onClick={() => onDraft(untitledIn(""))}>
              <Icon name="plus" /> New note
            </button>
          </div>
        )}
      </section>
    </div>
  );
});

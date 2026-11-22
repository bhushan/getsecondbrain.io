import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, ApiError, type Note } from "./api";
import { Editor } from "./Editor";
import { Icon } from "./Icons";

interface Props {
  noteId: string | null;
  /** Path for a new, unsaved note. */
  draftPath: string | null;
  onOpen(id: string): void;
  onOpenPath(path: string): void;
  onClose(): void;
  onChanged(): void;
  /** "sheet" floats over the Network; "page" fills the editor side of the Notes page. */
  layout?: "sheet" | "page";
}

export interface NotePanelHandle {
  /** Saves unsaved edits before the note is left. False when they could not be saved (the panel says why). */
  flush(): Promise<boolean>;
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const NotePanel = forwardRef<NotePanelHandle, Props>(function NotePanel({ noteId, draftPath, onOpen, onOpenPath, onClose, onChanged, layout = "sheet" }, ref) {
  const [note, setNote] = useState<Note | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const dirty = note ? text !== note.body : text.length > 0;
  /** Set once a new note is created: the draft is saved, so opening the created note must not save it again. */
  const created = useRef(false);

  useEffect(() => {
    created.current = false;
    setStatus(null);
    setRenaming(null);
    if (!noteId) {
      setNote(null);
      setText("");
      return;
    }
    // Only the latest request wins, so a quick run of clicks never shows an earlier note.
    let current = true;
    api
      .note(noteId)
      .then((loaded) => {
        if (!current) return;
        setNote(loaded);
        setText(loaded.body);
      })
      .catch((error: Error) => current && setStatus(error.message));
    return () => {
      current = false;
    };
  }, [noteId, loadKey]);

  const path = note?.path ?? draftPath;

  /** Saves the text. `follow` opens the saved note when it is new or moved; a flush before leaving does not. */
  async function save(follow = true): Promise<boolean> {
    if (!path) return true;
    setStatus("Saving…");
    try {
      const result = await api.save(path, text, note ? note.rev : 0);
      if (result.status === "conflict") {
        setStatus(`This note changed elsewhere (now revision ${result.note.rev}). Copy your text, then reload it.`);
        return false;
      }
      if (result.status === "not_found") {
        setStatus("This note no longer exists.");
        return false;
      }
      setStatus(result.status === "unchanged" ? "No changes" : "Saved");
      onChanged();
      if (!note) created.current = true;
      if (!follow) return true;
      if (!note || result.note.id !== note.id) onOpen(result.note.id);
      else {
        // Same note: refresh its revision and links, but keep the editor and anything typed since.
        const saved = note.id;
        void api.note(saved).then((loaded) => setNote((current) => (current?.id === saved ? loaded : current)));
      }
      return true;
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Could not save. Check your connection.");
      return false;
    }
  }

  useImperativeHandle(ref, () => ({ flush: () => (dirty && !created.current ? save(false) : Promise.resolve(true)) }));

  /** A wikilink resolves through the saved note's links; one typed since the last save opens by name. */
  const openLink = async (target: string) => {
    const wanted = target.trim().toLowerCase();
    if (!wanted) return;
    const known = note?.outgoing.find((link) => link.id && link.ref.toLowerCase() === wanted);
    if (known?.id) return onOpen(known.id);
    // Not saved yet: match a note by its full path or by its name, the way links resolve on save.
    const named = await api
      .suggest(target.trim())
      .then(({ notes }) => notes.find((meta) => meta.path.toLowerCase() === wanted || meta.path.split("/").pop()!.toLowerCase() === wanted))
      .catch(() => undefined);
    if (named) onOpen(named.id);
    else onOpenPath(target.trim());
  };

  async function rename() {
    if (!note || !renaming?.trim()) return;
    const result = await api.rename(note.id, renaming.trim());
    if (result.status === "exists") return setStatus("A note already has that name.");
    setRenaming(null);
    setLoadKey((k) => k + 1);
    onChanged();
  }

  async function trash() {
    if (!note) return;
    await api.trash(note.id);
    onChanged();
    onClose();
  }

  if (!path) return null;

  const parts = path.split("/");
  const name = parts.pop();

  return (
    <aside className={layout === "page" ? "panel note-page" : "panel sheet"} aria-label={`Note ${path}`}>
      <span className="grabber" aria-hidden="true" />
      <header className="panel-head">
        {renaming === null ? (
          <div className="note-heading">
            <nav className="crumbs" aria-label="Folder">
              <Icon name="note" size={14} />
              {parts.length === 0 ? <span>Top level</span> : parts.map((part, index) => <span key={index}>{part}</span>)}
            </nav>
            <h2 className="note-title" title={path}>
              {name}
            </h2>
          </div>
        ) : (
          <form
            className="rename"
            onSubmit={(event) => {
              event.preventDefault();
              void rename();
            }}
          >
            <label className="rename-label" htmlFor="rename-input">
              Rename or move. Use / for folders.
            </label>
            <input id="rename-input" autoFocus value={renaming} onChange={(event) => setRenaming(event.target.value)} />
            <div className="rename-actions">
              <button type="button" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Rename
              </button>
            </div>
          </form>
        )}
        <button className="icon" onClick={onClose} aria-label="Close note" title="Close">
          <Icon name="close" />
        </button>
      </header>

      <div className="panel-tools">
        <button className="primary" onClick={() => void save()} disabled={!dirty}>
          Save
        </button>
        {note && renaming === null && <button onClick={() => setRenaming(note.path)}>Rename</button>}
        {note && (
          <button className="danger" onClick={() => void trash()}>
            <Icon name="trash" size={16} /> Move to trash
          </button>
        )}
        <span className="status" role="status" data-dirty={dirty || undefined}>
          {status ?? (dirty ? "Unsaved changes" : note ? `Revision ${note.rev}, edited ${when(note.updatedAt)}` : "New note")}
        </span>
      </div>

      <Editor docKey={note ? `${note.id}:${loadKey}` : `draft:${draftPath}`} value={note?.body ?? ""} onChange={setText} onSave={() => void save()} onLink={(target) => void openLink(target)} />

      {note && (
        <footer className="links">
          <section aria-labelledby="links-out">
            <h3 id="links-out">
              Links to <span className="count">{note.outgoing.length}</span>
            </h3>
            {note.outgoing.length === 0 && <p className="muted">None yet. Write [[Note name]] to link.</p>}
            <ul>
              {note.outgoing.map((link) => (
                <li key={link.ref}>
                  {link.id ? (
                    <button className="chip" onClick={() => onOpen(link.id!)} title={link.path ?? undefined}>
                      {link.path}
                    </button>
                  ) : (
                    <button className="chip missing" onClick={() => onOpenPath(link.ref)} title="No note with this name yet. Open to create it.">
                      <Icon name="plus" size={14} /> {link.ref}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="links-in">
            <h3 id="links-in">
              Linked from <span className="count">{note.backlinks.length}</span>
            </h3>
            {note.backlinks.length === 0 && <p className="muted">No notes link here.</p>}
            <ul>
              {note.backlinks.map((back) => (
                <li key={back.id}>
                  <button className="chip" onClick={() => onOpen(back.id)} title={back.path}>
                    {back.path}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </footer>
      )}
    </aside>
  );
});

import { useEffect, useState } from "react";
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
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function NotePanel({ noteId, draftPath, onOpen, onOpenPath, onClose, onChanged }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const dirty = note ? text !== note.body : text.length > 0;

  useEffect(() => {
    setStatus(null);
    setRenaming(null);
    if (!noteId) {
      setNote(null);
      setText("");
      return;
    }
    api
      .note(noteId)
      .then((loaded) => {
        setNote(loaded);
        setText(loaded.body);
      })
      .catch((error: Error) => setStatus(error.message));
  }, [noteId, loadKey]);

  const path = note?.path ?? draftPath;

  async function save() {
    if (!path) return;
    setStatus("Saving…");
    try {
      const result = await api.save(path, text, note ? note.rev : 0);
      if (result.status === "conflict") {
        setStatus(`This note changed elsewhere (now revision ${result.note.rev}). Copy your text, then reload it.`);
        return;
      }
      if (result.status === "not_found") {
        setStatus("This note no longer exists.");
        return;
      }
      setStatus(result.status === "unchanged" ? "No changes" : "Saved");
      onChanged();
      if (!note || result.note.id !== note.id) onOpen(result.note.id);
      else setLoadKey((k) => k + 1);
    } catch (error) {
      setStatus(error instanceof ApiError ? error.message : "Could not save. Check your connection.");
    }
  }

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

  return (
    <aside className="panel sheet" aria-label={`Note ${path}`}>
      <span className="grabber" aria-hidden="true" />
      <header className="panel-head">
        {renaming === null ? (
          <h2 className="note-title" title={path}>
            {path.split("/").pop()}
            {path.includes("/") && <span className="note-folder">{path.split("/").slice(0, -1).join(" / ")}</span>}
          </h2>
        ) : (
          <form
            className="rename"
            onSubmit={(event) => {
              event.preventDefault();
              void rename();
            }}
          >
            <input autoFocus value={renaming} onChange={(event) => setRenaming(event.target.value)} aria-label="New path" />
            <button type="submit">Rename</button>
            <button type="button" onClick={() => setRenaming(null)}>
              Cancel
            </button>
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
        {note && <button onClick={() => void trash()}>Move to trash</button>}
        <span className="status" role="status">
          {status ?? (note ? `Revision ${note.rev}, edited ${when(note.updatedAt)}` : "New note")}
        </span>
      </div>

      <Editor docKey={`${noteId ?? draftPath}:${loadKey}`} value={note?.body ?? ""} onChange={setText} onSave={() => void save()} />

      {note && (
        <footer className="links">
          <section>
            <h3>Links to</h3>
            {note.outgoing.length === 0 && <p className="muted">None yet. Write [[Note name]] to link.</p>}
            <ul>
              {note.outgoing.map((link) => (
                <li key={link.ref}>
                  {link.id ? (
                    <button className="link" onClick={() => onOpen(link.id!)}>
                      {link.path}
                    </button>
                  ) : (
                    <button className="link missing" onClick={() => onOpenPath(link.ref)} title="No note with this name yet. Open to create it.">
                      {link.ref}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Linked from</h3>
            {note.backlinks.length === 0 && <p className="muted">No notes link here.</p>}
            <ul>
              {note.backlinks.map((back) => (
                <li key={back.id}>
                  <button className="link" onClick={() => onOpen(back.id)}>
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
}

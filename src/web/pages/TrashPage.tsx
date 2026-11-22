import { useEffect, useState } from "react";
import { api, type NoteMeta } from "../api";
import { PageHeader } from "./PageHeader";

/** Which delete is waiting for a second click: one note's id, the whole trash, or none. */
type Confirming = string | "all" | null;

export function TrashPage({ onChanged }: { onChanged(): void }) {
  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => void api.trashList().then(({ notes }) => setNotes(notes));
  useEffect(load, []);

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirming(null);
      load();
      onChanged();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page-trash">
      <PageHeader title="Trash">
        Notes you moved to the trash. Restoring brings back the note and its links. Deleting forever removes the note and all its earlier
        versions, and cannot be undone.
      </PageHeader>

      {notes && notes.length > 0 && (
        <div className="trash-toolbar">
          <span className="muted">
            {notes.length} {notes.length === 1 ? "note" : "notes"} in the trash
          </span>
          {confirming === "all" ? (
            <span className="trash-confirm" role="group" aria-label="Confirm emptying the trash">
              <span>Delete all {notes.length} forever?</span>
              <button type="button" className="btn-sm" onClick={() => setConfirming(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn-sm danger confirm" onClick={() => void run(api.emptyTrash, "Could not empty the trash. Try again.")} disabled={busy}>
                Delete forever
              </button>
            </span>
          ) : (
            <button type="button" className="btn-sm danger" onClick={() => setConfirming("all")}>
              Empty trash
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {notes?.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 7h15M10 4h4" />
              <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" />
            </svg>
          </span>
          <strong>The trash is empty.</strong>
          <p>Notes you trash land here. Bring them back, or delete them forever.</p>
        </div>
      )}
      {notes && notes.length > 0 && (
        <ul className="list-card">
          {notes.map((note) => {
            const slash = note.path.lastIndexOf("/");
            const asking = confirming === note.id;
            return (
              <li key={note.id}>
                <div className="list-text">
                  <strong>{note.path.slice(slash + 1)}</strong>
                  {slash > 0 && <span>{note.path.slice(0, slash)}</span>}
                </div>
                {asking ? (
                  <span className="trash-confirm" role="group" aria-label={`Confirm deleting ${note.path} forever`}>
                    <button type="button" className="btn-sm" onClick={() => setConfirming(null)} disabled={busy}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-sm danger confirm"
                      onClick={() => void run(() => api.deleteForever(note.id), "Could not delete the note. Try again.")}
                      disabled={busy}
                    >
                      Delete forever
                    </button>
                  </span>
                ) : (
                  <span className="trash-actions">
                    <button type="button" className="btn-sm ghost danger" onClick={() => setConfirming(note.id)} disabled={busy}>
                      Delete forever
                    </button>
                    <button type="button" className="btn-sm" onClick={() => void run(() => api.restore(note.id), "Could not restore the note. Try again.")} disabled={busy}>
                      Restore
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

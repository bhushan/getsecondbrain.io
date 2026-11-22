import { useEffect, useState } from "react";
import { api, type NoteMeta } from "../api";
import { PageHeader } from "./PageHeader";

export function TrashPage({ onChanged }: { onChanged(): void }) {
  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const load = () => void api.trashList().then(({ notes }) => setNotes(notes));
  useEffect(load, []);
  return (
    <main className="page page-trash">
      <PageHeader title="Trash">
        Notes you moved to the trash. Restoring brings back the note and its links.
      </PageHeader>
      {notes?.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 7h15M10 4h4" />
              <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7" />
            </svg>
          </span>
          <strong>The trash is empty.</strong>
          <p>Notes you trash from the map land here, and you can bring them back at any time.</p>
        </div>
      )}
      {notes && notes.length > 0 && (
        <ul className="list-card">
          {notes.map((note) => {
            const slash = note.path.lastIndexOf("/");
            return (
              <li key={note.id}>
                <div className="list-text">
                  <strong>{note.path.slice(slash + 1)}</strong>
                  {slash > 0 && <span>{note.path.slice(0, slash)}</span>}
                </div>
                <button type="button" className="pg-btn pg-btn-sm" onClick={() => void api.restore(note.id).then(() => (load(), onChanged()))}>
                  Restore
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

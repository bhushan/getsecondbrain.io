import { useState } from "react";
import { scanMarkdown } from "../../worker/lib/markdown";
import { api } from "../api";
import { notePathFor } from "../importPaths";
import { PageHeader } from "./PageHeader";

interface ImportProgress {
  total: number;
  done: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: string[];
  expectedLinks: number;
}

interface WorkspaceStats {
  notes: number;
  links: number;
  unresolved: number;
}

const CONCURRENCY = 4;

export function ImportPage({ onDone }: { onDone(): void }) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [empty, setEmpty] = useState(false);
  const running = progress !== null && stats === null;

  async function run(files: FileList) {
    // A folder upload gives paths like "Vault/Projects/Note.md": drop the vault folder and hidden folders.
    const notes = [...files].flatMap((file) => {
      const path = notePathFor(file.webkitRelativePath || file.name);
      return path ? [{ file, path }] : [];
    });
    setStats(null);
    setEmpty(!notes.length);
    if (!notes.length) {
      setProgress(null);
      return;
    }
    const state: ImportProgress = { total: notes.length, done: 0, created: 0, updated: 0, unchanged: 0, failed: [], expectedLinks: 0 };
    setProgress({ ...state });
    let next = 0;
    async function worker() {
      while (next < notes.length) {
        const { file, path } = notes[next++]!;
        try {
          const body = await file.text();
          state.expectedLinks += new Set(scanMarkdown(body).links.map((link) => link.ref.toLowerCase())).size;
          const saved = await api.save(path, body);
          if (saved.status === "created") state.created++;
          else if (saved.status === "updated") state.updated++;
          else if (saved.status === "unchanged") state.unchanged++;
          else state.failed.push(path);
        } catch (error) {
          state.failed.push(`${path}: ${(error as Error).message}`);
        }
        state.done++;
        setProgress({ ...state });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setStats(await api.stats());
    onDone();
  }

  return (
    <main className="page page-import">
      <PageHeader eyebrow="Import" title="Import an Obsidian vault">
        Choose your vault folder. Every markdown file becomes a note at the same path, with its links and tags. Importing again only changes notes whose
        text changed. Your vault on disk is not touched.
      </PageHeader>

      <label className="drop-zone" data-busy={running || undefined}>
        <input
          type="file"
          className="sr-only"
          // @ts-expect-error: directory pickers are non-standard attributes.
          webkitdirectory=""
          multiple
          disabled={running}
          onChange={(event) => event.target.files && void run(event.target.files)}
        />
        <span className="drop-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
            <path d="M12 16.5v-5M9.5 14 12 11.5l2.5 2.5" />
          </svg>
        </span>
        <strong>{running ? "Importing your vault" : "Choose your vault folder"}</strong>
        <span className="drop-hint">The folder that holds your .obsidian folder. Hidden folders and files that are not markdown are skipped.</span>
        <span className="button primary drop-button" aria-hidden="true">
          Choose vault folder
        </span>
      </label>
      <p className="muted pg-small">Free accounts can import about 3,500 notes a day.</p>

      {empty && (
        <p className="callout" role="status">
          No markdown files found in that folder.
        </p>
      )}

      {progress && (
        <section className="import-card" role="status" aria-live="polite">
          <div className="import-head">
            <strong>{stats ? "Import finished" : "Importing…"}</strong>
            <span>
              {progress.done} of {progress.total}
            </span>
          </div>
          <div className="meter" role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <dl className="import-stats">
            <div>
              <dt>New</dt>
              <dd>{progress.created}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{progress.updated}</dd>
            </div>
            <div>
              <dt>Unchanged</dt>
              <dd>{progress.unchanged}</dd>
            </div>
            <div data-bad={progress.failed.length > 0 || undefined}>
              <dt>Failed</dt>
              <dd>{progress.failed.length}</dd>
            </div>
          </dl>
          {stats && (
            <p className="import-result">
              Imported {progress.created} new, {progress.updated} updated and {progress.unchanged} unchanged notes. The files hold {progress.expectedLinks} links;
              this workspace now has {stats.notes} notes and {stats.links} links ({stats.unresolved} point at notes that do not exist yet).
            </p>
          )}
          {progress.failed.length > 0 && (
            <details className="import-failed">
              <summary>{progress.failed.length} files could not be imported</summary>
              <ul>
                {progress.failed.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </main>
  );
}

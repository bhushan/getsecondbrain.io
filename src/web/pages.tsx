import { useEffect, useState } from "react";
import { scanMarkdown } from "../worker/lib/markdown";
import { notePathFor } from "./importPaths";
import { api, type AuditEntry, type Connection, type Me, type NoteMeta } from "./api";

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function SignIn() {
  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <main className="signin">
      <div className="signin-card">
        <h1>Second Brain</h1>
        <p>Your notes, linked into one map, and available to every AI app you use.</p>
        <a className="button primary" href={`/auth/login?next=${next}`}>
          Sign in with Google
        </a>
        <p className="muted">Private beta. Ask for access if your account is not on the list yet.</p>
      </div>
    </main>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function ConnectPage({ me }: { me: Me }) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const load = () => api.connections().then(({ connections }) => setConnections(connections));
  useEffect(() => void load(), []);
  const url = me.mcpUrl;
  const claudeCode = `claude mcp add --transport http second-brain ${url}`;
  const cursor = JSON.stringify({ mcpServers: { "second-brain": { url } } }, null, 2);

  return (
    <main className="page">
      <h1>Connect your AI apps</h1>
      <p className="lede">Add this address to an app once. It asks you to sign in here and choose which workspace it can use.</p>
      <div className="address">
        <code>{url}</code>
        <Copy text={url} label="Copy address" />
      </div>

      <section className="steps">
        <h2>Claude</h2>
        <p>Settings, Connectors, Add custom connector. Paste the address, then Connect.</p>
        <h2>Claude Code</h2>
        <div className="snippet">
          <code>{claudeCode}</code>
          <Copy text={claudeCode} label="Copy" />
        </div>
        <p>Then run <code>/mcp</code> inside Claude Code and choose Authenticate.</p>
        <h2>ChatGPT</h2>
        <p>Settings, Apps and connectors, Advanced, turn on Developer mode. Then Create, paste the address, and choose OAuth.</p>
        <h2>Cursor</h2>
        <div className="snippet">
          <pre>{cursor}</pre>
          <Copy text={cursor} label="Copy" />
        </div>
        <p>Add this to <code>~/.cursor/mcp.json</code>, then choose Connect in Cursor's MCP settings.</p>
      </section>

      <section>
        <h2>Connected apps</h2>
        {connections === null && <p className="muted">Loading…</p>}
        {connections?.length === 0 && <p className="muted">Nothing connected yet.</p>}
        <ul className="rows">
          {connections?.map((connection) => (
            <li key={connection.id}>
              <div>
                <strong>{connection.app}</strong>
                <span className="muted">
                  {connection.workspaceName ?? "Unknown workspace"}, {connection.canWrite ? "can read and write" : "read only"}, since{" "}
                  {when(connection.createdAt * (connection.createdAt < 1e12 ? 1000 : 1))}
                </span>
              </div>
              <button onClick={() => void api.disconnect(connection.id).then(load)}>Disconnect</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

interface ImportProgress {
  total: number;
  done: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: string[];
  expectedLinks: number;
}

const CONCURRENCY = 4;

export function ImportPage({ onDone }: { onDone(): void }) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function run(files: FileList) {
    // A folder upload gives paths like "Vault/Projects/Note.md": drop the vault folder and hidden folders.
    const notes = [...files].flatMap((file) => {
      const path = notePathFor(file.webkitRelativePath || file.name);
      return path ? [{ file, path }] : [];
    });
    if (!notes.length) {
      setResult("No markdown files found in that folder.");
      return;
    }
    const state: ImportProgress = { total: notes.length, done: 0, created: 0, updated: 0, unchanged: 0, failed: [], expectedLinks: 0 };
    setResult(null);
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
    const stats = await api.stats();
    setResult(
      `Imported ${state.created} new, ${state.updated} updated and ${state.unchanged} unchanged notes. ` +
        `The files hold ${state.expectedLinks} links; this workspace now has ${stats.notes} notes and ${stats.links} links (${stats.unresolved} point at notes that do not exist yet).`,
    );
    onDone();
  }

  return (
    <main className="page">
      <h1>Import an Obsidian vault</h1>
      <p className="lede">
        Choose your vault folder. Every markdown file becomes a note at the same path, with its links and tags. Importing again only
        changes notes whose text changed. Your vault on disk is not touched.
      </p>
      <label className="button primary file">
        Choose vault folder
        <input
          type="file"
          // @ts-expect-error: directory pickers are non-standard attributes.
          webkitdirectory=""
          multiple
          onChange={(event) => event.target.files && void run(event.target.files)}
        />
      </label>
      <p className="muted">Free accounts can import about 3,500 notes a day.</p>
      {progress && (
        <div className="progress" role="status">
          <progress max={progress.total} value={progress.done} />
          <span>
            {progress.done} of {progress.total}
          </span>
        </div>
      )}
      {result && <p className="result">{result}</p>}
      {progress && progress.failed.length > 0 && (
        <details>
          <summary>{progress.failed.length} files could not be imported</summary>
          <ul>
            {progress.failed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}

export function TrashPage({ onChanged }: { onChanged(): void }) {
  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const load = () => api.trashList().then(({ notes }) => setNotes(notes));
  useEffect(() => void load(), []);
  return (
    <main className="page">
      <h1>Trash</h1>
      <p className="lede">Notes you moved to the trash. Restoring brings back the note and its links.</p>
      {notes?.length === 0 && <p className="muted">The trash is empty.</p>}
      <ul className="rows">
        {notes?.map((note) => (
          <li key={note.id}>
            <div>
              <strong>{note.path}</strong>
            </div>
            <button onClick={() => void api.restore(note.id).then(() => (load(), onChanged()))}>Restore</button>
          </li>
        ))}
      </ul>
    </main>
  );
}

const ACTIONS: Record<string, string> = {
  create: "created",
  update: "edited",
  rename: "renamed",
  relink: "updated links in",
  trash: "trashed",
  restore: "restored",
};

export function ActivityPage({ onOpen }: { onOpen(id: string): void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => void api.activity().then(({ entries }) => setEntries(entries)), []);
  return (
    <main className="page">
      <h1>Activity</h1>
      <p className="lede">What you and your connected apps did in this workspace, newest first.</p>
      {entries?.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="rows activity">
        {entries?.map((entry, index) => {
          const who = entry.actor.kind === "app" ? entry.actor.app : "You";
          const action = entry.action.startsWith("read:") ? `used ${entry.action.slice(5).replace(/_/g, " ")}` : (ACTIONS[entry.action] ?? entry.action);
          return (
            <li key={index}>
              <div>
                <strong>{who}</strong> {action}{" "}
                {entry.noteId && (
                  <button className="link" onClick={() => onOpen(entry.noteId!)}>
                    a note
                  </button>
                )}
              </div>
              <span className="muted">{when(entry.at)}</span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

import { useEffect, useState } from "react";
import { scanMarkdown } from "../worker/lib/markdown";
import { connectGuides, TRY_PROMPTS, type GuideStep } from "./connectGuides";
import { notePathFor } from "./importPaths";
import { api, type AuditEntry, type Connection, type Me, type NoteMeta } from "./api";

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function SignIn() {
  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <main className="signin">
      <div className="signin-card">
        <div className="signin-brand">
          <img src="/logo.svg" alt="" width="44" height="44" />
          <span className="beta-tag">Beta</span>
        </div>
        <h1>Second Brain</h1>
        <p>Your notes, linked into one map, and available to every AI app and agent you use.</p>
        <a className="button primary wide" href={`/auth/login?next=${next}`}>
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

const GUIDE_KEY = "sb.connect-app";

function readGuide(): string {
  try {
    return localStorage.getItem(GUIDE_KEY) ?? "claude";
  } catch {
    return "claude";
  }
}

function GuideSteps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="guide-steps">
      {steps.map((step, index) => (
        <li key={index}>
          <p>{step.text}</p>
          {step.code && (
            <div className="snippet-block">
              {step.codeLabel && <span className="snippet-label">{step.codeLabel}</span>}
              <div className="snippet">
                {step.code.includes("\n") ? <pre>{step.code}</pre> : <code>{step.code}</code>}
                <Copy text={step.code} label="Copy" />
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ConnectPage({ me }: { me: Me }) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const load = () => api.connections().then(({ connections }) => setConnections(connections));
  useEffect(() => void load(), []);
  const url = me.mcpUrl;
  const guides = connectGuides(url);
  const [active, setActive] = useState(readGuide);
  const guide = guides.find((item) => item.id === active) ?? guides[0]!;
  const choose = (id: string) => {
    setActive(id);
    try {
      localStorage.setItem(GUIDE_KEY, id);
    } catch {
      /* the choice just is not remembered */
    }
  };

  return (
    <main className="page connect">
      <h1>Connect any AI app or agent</h1>
      <p className="lede">
        Chat apps, code editors and terminal agents, on any device, all connect with the same address. Once connected, an app can search
        your notes, read them and save new ones, but only in the workspace you choose, and it can never delete anything.
      </p>

      <h2>Your connection address</h2>
      <p className="muted">The same address works for every app. You only need to sign in to Second Brain when the app asks.</p>
      <div className="address">
        <code>{url}</code>
        <Copy text={url} label="Copy address" />
      </div>

      <h2>How connecting works</h2>
      <ol className="flow">
        <li>Add the address above to your app, using the steps for that app below.</li>
        <li>The app opens a Second Brain page. Sign in with Google, choose a workspace, and choose whether the app may create and edit notes.</li>
        <li>Choose Connect. The app now has Second Brain tools, and it shows up under Connected apps at the bottom of this page.</li>
      </ol>

      <h2 id="apps-heading">Pick your app</h2>
      <div className="app-tabs" role="tablist" aria-labelledby="apps-heading">
        {guides.map((item) => (
          <button
            key={item.id}
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={item.id === guide.id}
            aria-controls="guide-panel"
            className={item.id === guide.id ? "active" : undefined}
            onClick={() => choose(item.id)}
          >
            <strong>{item.name}</strong>
            <span>{item.where}</span>
          </button>
        ))}
      </div>
      <section className="guide" role="tabpanel" id="guide-panel" aria-labelledby={`tab-${guide.id}`}>
        <p className="guide-where">
          <strong>{guide.name}</strong> <span className="muted">{guide.where}</span>
        </p>
        {guide.note && <p className="guide-note">{guide.note}</p>}
        <GuideSteps steps={guide.steps} />
        <h3>Make Second Brain its only memory</h3>
        <p className="muted">
          Connecting gives {guide.name} the tools; this rule tells it to use them every time. It searches Second Brain before answering
          anything about you, saves what you tell it there, and stops keeping a separate memory of its own.
        </p>
        <GuideSteps steps={guide.memory} />
      </section>

      <h2>On the Second Brain page</h2>
      <dl className="explain">
        <dt>Workspace it can use</dt>
        <dd>The app sees only this workspace. To give an app a different workspace, disconnect it and connect again.</dd>
        <dt>Search and read notes</dt>
        <dd>Always on. The app can search, open notes, follow links and list tags.</dd>
        <dt>Create and edit notes</dt>
        <dd>
          Untick it for read only. When ticked, the app can save new notes, add to notes and link them. Every change keeps the earlier
          version, and apps can never delete or trash a note.
        </dd>
      </dl>

      <h2>Try it</h2>
      <p className="muted">Ask your app something like this. Naming Second Brain helps the app pick the right tool.</p>
      <ul className="prompts">
        {TRY_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <span>{prompt}</span>
            <Copy text={prompt} label="Copy" />
          </li>
        ))}
      </ul>
      <p className="muted">Notes an app saves appear on the map straight away, and every action is listed under Activity.</p>

      <h2>If something goes wrong</h2>
      <dl className="explain">
        <dt>The app says it cannot connect or finds no server</dt>
        <dd>
          Check the address is exactly <code>{url}</code>, including <code>/mcp</code> at the end. Choose the HTTP or Streamable HTTP type if the app
          asks, not SSE.
        </dd>
        <dt>"This account is not on the list yet"</dt>
        <dd>Second Brain is in private beta. Sign in with the Google account that has access, or ask for an invitation at hello@getsecondbrain.io.</dd>
        <dt>The sign-in window closed or showed "This sign-in link expired"</dt>
        <dd>Start the connection again from the app. Allow pop-ups for the app if your browser blocked the window.</dd>
        <dt>Connected, but the app never uses Second Brain</dt>
        <dd>Switch the connector or its tools on for the chat, and add the only-memory rule from your app's steps above. Until then, name Second Brain in your request.</dd>
        <dt>The app can read but not save</dt>
        <dd>It was connected read only. Disconnect it below, connect again, and keep "Create and edit notes" ticked. Some ChatGPT plans only allow reading.</dd>
        <dt>It worked, then asks to sign in again</dt>
        <dd>The app was disconnected here or its sign-in expired. Choose Connect (or Authenticate) in the app again.</dd>
      </dl>

      <section>
        <h2>Connected apps</h2>
        {connections === null && <p className="muted">Loading…</p>}
        {connections?.length === 0 && <p className="muted">Nothing connected yet. Follow the steps above, then come back here.</p>}
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
        {connections !== null && (
          <p>
            <button className="link" onClick={() => void load()}>
              Refresh the list
            </button>
          </p>
        )}
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

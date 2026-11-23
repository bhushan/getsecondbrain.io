import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Me, setWorkspace } from "./api";
import { appLogo } from "./appLogos";
import { connectGuides } from "./connectGuides";
import { type GraphHandle, GraphView } from "./GraphView";
import { Icon, type IconName } from "./Icons";
import { NotePanel, type NotePanelHandle } from "./NotePanel";
import { untitledPath } from "./noteTree";
import { NotesPage } from "./NotesPage";
import { ActivityPage, ConnectPage, SettingsPage, SignIn, SkillsPage, SourcesPage, TrashPage } from "./pages";
import { Search } from "./Search";

type Page = "network" | "notes" | "skills" | "connect" | "sources" | "trash" | "activity" | "settings";
/** Pages in the dock, plus Settings, which opens from the workspace menu and the account row. */
const PAGES: { id: Page; label: string; short: string; icon: IconName; path: string; inDock?: false }[] = [
  { id: "network", label: "Network", short: "Network", icon: "map", path: "/" },
  { id: "notes", label: "Notes", short: "Notes", icon: "folder", path: "/notes" },
  { id: "skills", label: "Skills", short: "Skills", icon: "skills", path: "/skills" },
  // AI apps use your notes over MCP; Sources send notes in. Paths stay stable for old links.
  { id: "connect", label: "AI apps", short: "AI apps", icon: "connect", path: "/connect" },
  { id: "sources", label: "Sources", short: "Sources", icon: "import", path: "/sources" },
  { id: "activity", label: "Activity", short: "Activity", icon: "activity", path: "/activity" },
  { id: "trash", label: "Trash", short: "Trash", icon: "trash", path: "/trash" },
  { id: "settings", label: "Settings", short: "Settings", icon: "settings", path: "/settings", inDock: false },
];
/** The one-time import moved into Sources; its old address still lands there. */
const pageFromPath = (path: string): Page => (path === "/import" ? "sources" : (PAGES.find((page) => page.path === path)?.id ?? "network"));
const WORKSPACE_KEY = "sb.workspace";
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

/** How much of the map an open note sheet covers: on the right on wide screens, at the bottom on phones. */
function coveredByNote(): { right: number; bottom: number } {
  const sheet = document.querySelector(".panel")?.getBoundingClientRect();
  if (!sheet) return { right: 0, bottom: 0 };
  const bottomSheet = sheet.width > window.innerWidth * 0.9;
  return bottomSheet ? { right: 0, bottom: window.innerHeight - sheet.top } : { right: window.innerWidth - sheet.left, bottom: 0 };
}

/** The first thing a new workspace sees: connect an AI app, the way most notes will arrive. */
function EmptyMap({ mcpUrl, onConnect, onImport, onWrite }: { mcpUrl: string; onConnect(): void; onImport(): void; onWrite(): void }) {
  const apps = connectGuides(mcpUrl).flatMap((guide) => {
    const logo = appLogo(guide.id);
    return logo ? [{ ...logo, name: guide.name }] : [];
  });
  return (
    <section className="empty" aria-labelledby="empty-title">
      <img className="empty-mark" src="/logo.svg" alt="" width="48" height="48" />
      <h2 id="empty-title">Connect an AI app to start your network</h2>
      <p>Add one address to Claude, ChatGPT, Cursor or any agent. Every note it saves lands here, linked to the notes it mentions.</p>
      <ul className="empty-apps" aria-label="Apps with a setup guide">
        {apps.map((app) => (
          <li key={app.src} title={app.name}>
            <img src={app.src} alt={app.name} width="20" height="20" className={app.mono ? "logo-mono" : undefined} />
          </li>
        ))}
      </ul>
      <div className="empty-actions">
        <button className="primary" onClick={onConnect}>
          <Icon name="connect" /> Connect an app or agent
        </button>
        <button onClick={onImport}>
          <Icon name="import" /> Import a vault
        </button>
      </div>
      <button className="link quiet" onClick={onWrite}>
        Or write the first note yourself
      </button>
    </section>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null | "signed_out">(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [page, setPage] = useState<Page>(pageFromPath(location.pathname));
  const [selected, setSelected] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  // Null until the map has loaded once, so the empty state never flashes before the notes arrive.
  const [stats, setStats] = useState<{ nodes: number; edges: number; laying: boolean } | null>(null);
  const graph = useRef<GraphHandle>(null);
  const panel = useRef<NotePanelHandle>(null);

  const load = useCallback(async () => {
    try {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(WORKSPACE_KEY);
      } catch {}
      if (saved) setWorkspace(saved);
      let loaded: Me;
      try {
        loaded = await api.me();
      } catch (error) {
        // A remembered workspace the user no longer has: fall back to their first one.
        if (!(error instanceof ApiError && error.status === 403)) throw error;
        try {
          localStorage.removeItem(WORKSPACE_KEY);
        } catch {}
        setWorkspace("");
        loaded = await api.me();
      }
      setWorkspace(loaded.workspaceId);
      setMe(loaded);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSignupOpen(error.body.signup === "open");
        setMe("signed_out");
      }
      else throw error;
    }
  }, []);

  useEffect(() => void load(), [load]);
  /** Unsaved edits are saved before another note opens; if they cannot be, the note stays open and says why. */
  const leaveNote = async () => (await panel.current?.flush()) ?? true;
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => {
    // Back and forward: save first; if the save fails, stay on the page that holds the unsaved text.
    const onPop = async () => {
      const next = pageFromPath(location.pathname);
      if (next === pageRef.current) return;
      if (await leaveNote()) setPage(next);
      else history.pushState(null, "", PAGES.find((p) => p.id === pageRef.current)!.path);
    };
    const listener = () => void onPop();
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);

  const go = async (next: Page) => {
    if (next !== page && !(await leaveNote())) return;
    const path = PAGES.find((p) => p.id === next)!.path;
    if (location.pathname !== path) history.pushState(null, "", path);
    setPage(next);
  };

  /** Opens a note where the user is: in the editor on the Notes page, otherwise on the Network. */
  const open = async (id: string) => {
    if (id === selected && draftPath === null) return;
    if (!(await leaveNote())) return;
    setDraftPath(null);
    setSelected(id);
    if (page === "notes") return;
    if (page !== "network") await go("network");
    window.setTimeout(() => graph.current?.focus(id, coveredByNote()), 50);
  };

  const draft = async (path: string) => {
    if (!(await leaveNote())) return;
    setSelected(null);
    setDraftPath(path);
    if (page !== "notes" && page !== "network") await go("network");
  };

  const openPath = async (path: string) => {
    try {
      const note = await api.noteByPath(path);
      await open(note.id);
    } catch {
      await draft(path);
    }
  };

  const closeNote = async () => {
    if (!(await leaveNote())) return;
    setSelected(null);
    setDraftPath(null);
  };

  const switchWorkspace = async (id: string) => {
    // Save into the workspace the text belongs to, before the switch.
    if (!(await leaveNote())) return;
    try {
      localStorage.setItem(WORKSPACE_KEY, id);
    } catch {}
    setWorkspace(id);
    setSelected(null);
    setDraftPath(null);
    setStats(null);
    setMe((current) => (current && current !== "signed_out" ? { ...current, workspaceId: id } : current));
    setVersion((v) => v + 1);
  };

  const [naming, setNaming] = useState<string | null>(null);
  const newWorkspace = async (name: string) => {
    if (!name.trim()) return;
    const created = await api.createWorkspace(name.trim());
    setNaming(null);
    await load();
    await switchWorkspace(created.id);
  };

  const forgetWorkspace = () => {
    try {
      localStorage.removeItem(WORKSPACE_KEY);
    } catch {}
    setWorkspace("");
  };
  const workspaceDeleted = async () => {
    forgetWorkspace();
    setSelected(null);
    setDraftPath(null);
    setStats(null);
    await load();
    setVersion((v) => v + 1);
    go("network");
  };
  const workspaceRestored = async (id: string) => {
    await load();
    await switchWorkspace(id);
    go("network");
  };

  if (me === null)
    return (
      <div className="loading" role="status">
        <img src="/logo.svg" alt="" width="32" height="32" />
        <span className="sr-only">Loading</span>
      </div>
    );
  if (me === "signed_out") return <SignIn open={signupOpen} />;

  const refresh = () => setVersion((v) => v + 1);
  const newNote = () => void draft(untitledPath(graph.current?.paths() ?? [], ""));
  const panelOpen = page === "network" && (selected !== null || draftPath !== null);
  const workspace = me.workspaces.find((w) => w.id === me.workspaceId) ?? me.workspaces[0];

  return (
    <div className="app" data-page={page} data-note={panelOpen || undefined}>
      <div className={page === "network" ? "map" : "map behind"} aria-hidden={page !== "network" || undefined}>
        <GraphView
          ref={graph}
          version={version}
          selected={selected}
          highlighted={highlighted}
          active={page === "network"}
          onSelect={(id) => void (id ? open(id) : closeNote())}
          onStats={setStats}
        />
        <div className="map-top">
          <Search onResults={(ids) => setHighlighted(new Set(ids))} onOpen={(id) => void open(id)} onCreate={(path) => void openPath(path)} />
        </div>
        {stats && stats.nodes > 0 && (
          <div className="map-foot" role="toolbar" aria-label="Network">
            <span className="map-count" role="status">
              <span className={stats.laying ? "pulse on" : "pulse"} aria-hidden="true" />
              {stats.laying ? (
                "Arranging…"
              ) : (
                <>
                  {stats.nodes.toLocaleString()} notes <span className="sep">·</span> {stats.edges.toLocaleString()} links
                </>
              )}
            </span>
            <button className="ghost" onClick={() => graph.current?.relayout()} disabled={stats.laying || stats.nodes < 2} aria-label="Rearrange the network" title="Rearrange">
              <Icon name="shuffle" /> <span>Rearrange</span>
            </button>
            <button className="primary" onClick={newNote} aria-label="New note" title="New note">
              <Icon name="plus" /> <span>New note</span>
            </button>
          </div>
        )}
        {stats?.nodes === 0 && !panelOpen && page === "network" && (
          <EmptyMap mcpUrl={me.mcpUrl} onConnect={() => go("connect")} onImport={() => go("sources")} onWrite={newNote} />
        )}
      </div>

      <div className="rail">
        <header className="topbar">
          <a
            className="brand"
            href="/"
            aria-label="Second Brain, network"
            onClick={(event) => {
              event.preventDefault();
              go("network");
            }}
          >
            <img src="/logo.svg" alt="" width="28" height="28" />
            <span className="brand-name">Second Brain</span>
            <span className="beta-tag">Beta</span>
          </a>
          <div className="workspace-area">
            <label className="workspace" title={`Workspace: ${workspace?.name ?? ""}`}>
              <span className="ws-avatar" aria-hidden="true">
                {initial(workspace?.name ?? "")}
              </span>
              <span className="ws-text" aria-hidden="true">
                <span className="ws-label">Workspace</span>
                <span className="ws-name">{workspace?.name}</span>
              </span>
              <Icon name="chevrons" size={16} />
              <select
                aria-label="Workspace"
                value={me.workspaceId}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "__new") setNaming("");
                  else if (value === "__settings") go("settings");
                  else void switchWorkspace(value);
                }}
              >
                {me.workspaces.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
                <option value="__new">New workspace…</option>
                <option value="__settings">Workspace settings…</option>
              </select>
            </label>
            {naming !== null && (
              <form
                className="new-workspace"
                onSubmit={(event) => {
                  event.preventDefault();
                  void newWorkspace(naming);
                }}
              >
                <input autoFocus placeholder="Workspace name" aria-label="New workspace name" value={naming} onChange={(event) => setNaming(event.target.value)} />
                <div className="new-workspace-actions">
                  <button type="button" onClick={() => setNaming(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary">
                    Create
                  </button>
                </div>
              </form>
            )}
          </div>
          <form method="post" action="/auth/logout" className="account">
            <span className="avatar" aria-hidden="true">
              {initial(me.user.name)}
            </span>
            <span className="account-text">
              <span className="account-name">{me.user.name}</span>
              <span className="account-email">{me.user.email}</span>
            </span>
            <button type="button" className="icon" aria-label="Settings" title="Settings" onClick={() => go("settings")}>
              <Icon name="settings" />
            </button>
            <button type="submit" className="icon" aria-label="Sign out" title="Sign out">
              <Icon name="signout" />
            </button>
          </form>
        </header>
        <nav className="dock" aria-label="Main">
          <ul>
            {PAGES.filter((item) => item.inDock !== false).map((item) => (
              <li key={item.id}>
                <a
                  href={item.path}
                  title={item.label}
                  aria-current={page === item.id ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    go(item.id);
                  }}
                >
                  <span className="dock-icon">
                    <Icon name={item.icon} />
                  </span>
                  <span className="label-long">{item.label}</span>
                  <span className="label-short" aria-hidden="true">
                    {item.short}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {page !== "network" && (
        <div className={page === "notes" ? "sheet page-sheet notes-sheet" : "sheet page-sheet"}>
          {page === "notes" && (
            <NotesPage
              ref={panel}
              version={version}
              selected={selected}
              draftPath={draftPath}
              onOpen={(id) => void open(id)}
              onOpenPath={(path) => void openPath(path)}
              onDraft={(path) => void draft(path)}
              onClose={() => void closeNote()}
              onChanged={refresh}
            />
          )}
          {page === "skills" && <SkillsPage onChanged={refresh} />}
          {page === "connect" && <ConnectPage me={me} onSkills={() => go("skills")} />}
          {page === "sources" && <SourcesPage onChanged={refresh} />}
          {page === "trash" && <TrashPage onChanged={refresh} />}
          {page === "activity" && <ActivityPage onOpen={(id) => void open(id)} />}
          {page === "settings" && (
            <SettingsPage
              me={me}
              onRenamed={() => void load()}
              onDeleted={() => void workspaceDeleted()}
              onRestored={(id) => void workspaceRestored(id)}
            />
          )}
        </div>
      )}

      {panelOpen && (
        <NotePanel
          ref={panel}
          noteId={selected}
          draftPath={draftPath}
          onOpen={(id) => void open(id)}
          onOpenPath={(path) => void openPath(path)}
          onClose={() => void closeNote()}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

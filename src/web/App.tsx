import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Me, setWorkspace } from "./api";
import { type GraphHandle, GraphView } from "./GraphView";
import { Icon, type IconName } from "./Icons";
import { NotePanel } from "./NotePanel";
import { ActivityPage, ConnectPage, ImportPage, SignIn, TrashPage } from "./pages";
import { Search } from "./Search";

type Page = "map" | "connect" | "import" | "trash" | "activity";
const PAGES: { id: Page; label: string; short: string; icon: IconName; path: string }[] = [
  { id: "map", label: "Map", short: "Map", icon: "map", path: "/" },
  { id: "connect", label: "Connect apps", short: "Connect", icon: "connect", path: "/connect" },
  { id: "import", label: "Import", short: "Import", icon: "import", path: "/import" },
  { id: "activity", label: "Activity", short: "Activity", icon: "activity", path: "/activity" },
  { id: "trash", label: "Trash", short: "Trash", icon: "trash", path: "/trash" },
];
const pageFromPath = (path: string): Page => PAGES.find((page) => page.path === path)?.id ?? "map";
const WORKSPACE_KEY = "sb.workspace";

/** How much of the map an open note sheet covers: on the right on wide screens, at the bottom on phones. */
function coveredByNote(): { right: number; bottom: number } {
  const sheet = document.querySelector(".panel")?.getBoundingClientRect();
  if (!sheet) return { right: 0, bottom: 0 };
  const fromBottom = sheet.left < window.innerWidth / 3;
  return fromBottom ? { right: 0, bottom: window.innerHeight - sheet.top } : { right: window.innerWidth - sheet.left, bottom: 0 };
}

export function App() {
  const [me, setMe] = useState<Me | null | "signed_out">(null);
  const [page, setPage] = useState<Page>(pageFromPath(location.pathname));
  const [selected, setSelected] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const [stats, setStats] = useState({ nodes: 0, edges: 0, laying: false });
  const graph = useRef<GraphHandle>(null);

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
      if (error instanceof ApiError && error.status === 401) setMe("signed_out");
      else throw error;
    }
  }, []);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    const onPop = () => setPage(pageFromPath(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next: Page) => {
    const path = PAGES.find((p) => p.id === next)!.path;
    if (location.pathname !== path) history.pushState(null, "", path);
    setPage(next);
  };

  const open = (id: string) => {
    setDraftPath(null);
    setSelected(id);
    if (page !== "map") go("map");
    window.setTimeout(() => graph.current?.focus(id, coveredByNote()), 50);
  };

  const openPath = async (path: string) => {
    try {
      const note = await api.noteByPath(path);
      open(note.id);
    } catch {
      setSelected(null);
      setDraftPath(path);
      if (page !== "map") go("map");
    }
  };

  const switchWorkspace = (id: string) => {
    try {
      localStorage.setItem(WORKSPACE_KEY, id);
    } catch {}
    setWorkspace(id);
    setSelected(null);
    setDraftPath(null);
    setMe((current) => (current && current !== "signed_out" ? { ...current, workspaceId: id } : current));
    setVersion((v) => v + 1);
  };

  const [naming, setNaming] = useState<string | null>(null);
  const newWorkspace = async (name: string) => {
    if (!name.trim()) return;
    const created = await api.createWorkspace(name.trim());
    setNaming(null);
    await load();
    switchWorkspace(created.id);
  };

  if (me === null) return <div className="loading">Loading…</div>;
  if (me === "signed_out") return <SignIn />;

  const refresh = () => setVersion((v) => v + 1);
  const panelOpen = page === "map" && (selected !== null || draftPath !== null);

  return (
    <div className="app" data-page={page} data-note={panelOpen || undefined}>
      <div className={page === "map" ? "map" : "map behind"} aria-hidden={page !== "map" || undefined}>
        <GraphView
          ref={graph}
          version={version}
          selected={selected}
          highlighted={highlighted}
          onSelect={(id) => (id ? open(id) : (setSelected(null), setDraftPath(null)))}
          onStats={setStats}
        />
        <div className="map-top">
          <Search onResults={(ids) => setHighlighted(new Set(ids))} onOpen={open} onCreate={(path) => void openPath(path)} />
        </div>
        <div className="map-foot">
          <span className="map-count" role="status">
            {stats.nodes.toLocaleString()} notes, {stats.edges.toLocaleString()} links
            {stats.laying && <span className="arranging">, arranging…</span>}
          </span>
          <button className="ghost" onClick={() => graph.current?.relayout()} disabled={stats.laying || stats.nodes < 2}>
            <Icon name="shuffle" /> <span>Rearrange</span>
          </button>
          <button className="sun" onClick={() => (setSelected(null), setDraftPath("Untitled"))}>
            <Icon name="plus" /> <span>New note</span>
          </button>
        </div>
        {stats.nodes === 0 && !panelOpen && page === "map" && (
          <div className="empty">
            <h2>An empty map</h2>
            <p>Connect an AI app or agent to start saving notes, import your Obsidian vault, or write the first note yourself.</p>
            <div className="empty-actions">
              <button className="sun" onClick={() => go("connect")}>
                Connect an app
              </button>
              <button className="ghost" onClick={() => go("import")}>
                Import a vault
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rail">
        <header className="topbar">
          <a
            className="brand"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              go("map");
            }}
          >
            <img src="/logo.svg" alt="" width="28" height="28" />
            <span className="brand-name">Second Brain</span>
            <span className="beta-tag">Beta</span>
          </a>
          <label className="workspace">
            <span className="sr-only">Workspace</span>
            <select
              value={me.workspaceId}
              onChange={(event) => (event.target.value === "__new" ? setNaming("") : switchWorkspace(event.target.value))}
            >
              {me.workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
              <option value="__new">New workspace…</option>
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
              <button type="submit">Create</button>
              <button type="button" onClick={() => setNaming(null)}>
                Cancel
              </button>
            </form>
          )}
          <form method="post" action="/auth/logout" className="account">
            <span title={me.user.email}>{me.user.name}</span>
            <button type="submit" aria-label="Sign out" title="Sign out">
              <Icon name="signout" />
            </button>
          </form>
        </header>
        <nav className="dock" aria-label="Main">
          <ul>
            {PAGES.map((item) => (
              <li key={item.id}>
                <a
                  href={item.path}
                  aria-current={page === item.id ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    go(item.id);
                  }}
                >
                  <Icon name={item.icon} />
                  <span className="label-long">{item.label}</span>
                  <span className="label-short">{item.short}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {page !== "map" && (
        <div className="sheet page-sheet">
          {page === "connect" && <ConnectPage me={me} />}
          {page === "import" && <ImportPage onDone={refresh} />}
          {page === "trash" && <TrashPage onChanged={refresh} />}
          {page === "activity" && <ActivityPage onOpen={open} />}
        </div>
      )}

      {panelOpen && (
        <NotePanel
          noteId={selected}
          draftPath={draftPath}
          onOpen={open}
          onOpenPath={(path) => void openPath(path)}
          onClose={() => (setSelected(null), setDraftPath(null))}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

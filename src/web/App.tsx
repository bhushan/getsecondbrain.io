import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Me, setWorkspace } from "./api";
import { type GraphHandle, GraphView } from "./GraphView";
import { NotePanel } from "./NotePanel";
import { ActivityPage, ConnectPage, ImportPage, SignIn, TrashPage } from "./pages";
import { Search } from "./Search";

type Page = "map" | "connect" | "import" | "trash" | "activity";
const PAGES: { id: Page; label: string; path: string }[] = [
  { id: "map", label: "Map", path: "/" },
  { id: "import", label: "Import", path: "/import" },
  { id: "connect", label: "Connect apps", path: "/connect" },
  { id: "activity", label: "Activity", path: "/activity" },
  { id: "trash", label: "Trash", path: "/trash" },
];
const pageFromPath = (path: string): Page => PAGES.find((page) => page.path === path)?.id ?? "map";
const WORKSPACE_KEY = "sb.workspace";

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
    window.setTimeout(() => graph.current?.focus(id), 50);
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
    <div className={`app ${panelOpen ? "with-panel" : ""}`}>
      <nav className="rail" aria-label="Main">
        <div className="brand">Second Brain</div>
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
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <form method="post" action="/auth/logout" className="account">
          <span title={me.user.email}>{me.user.name}</span>
          <button type="submit">Sign out</button>
        </form>
      </nav>

      <div className="stage">
        <div className={page === "map" ? "map" : "map hidden"}>
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
            <span>
              {stats.nodes.toLocaleString()} notes, {stats.edges.toLocaleString()} links
              {stats.laying && ", arranging the map…"}
            </span>
            <button onClick={() => graph.current?.relayout()} disabled={stats.laying || stats.nodes < 2}>
              Rearrange
            </button>
            <button onClick={() => (setSelected(null), setDraftPath("Untitled"))}>New note</button>
          </div>
          {stats.nodes === 0 && !panelOpen && (
            <div className="empty">
              <h2>An empty map</h2>
              <p>Import your Obsidian vault, connect an AI app to start saving notes, or write the first one yourself.</p>
              <div className="empty-actions">
                <button className="primary" onClick={() => go("import")}>
                  Import a vault
                </button>
                <button onClick={() => go("connect")}>Connect an app</button>
              </div>
            </div>
          )}
        </div>
        {page === "connect" && <ConnectPage me={me} />}
        {page === "import" && <ImportPage onDone={refresh} />}
        {page === "trash" && <TrashPage onChanged={refresh} />}
        {page === "activity" && <ActivityPage onOpen={open} />}
      </div>

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

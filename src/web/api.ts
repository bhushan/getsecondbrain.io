export interface NoteMeta {
  id: string;
  path: string;
  title: string;
  rev: number;
  createdAt: number;
  updatedAt: number;
}
export interface Note extends NoteMeta {
  body: string;
  outgoing: { ref: string; embed: boolean; id: string | null; path: string | null }[];
  backlinks: NoteMeta[];
}
export interface Workspace {
  id: string;
  name: string;
  role: string;
}
export interface Me {
  user: { id: string; email: string; name: string };
  workspaceId: string;
  workspaces: Workspace[];
  mcpUrl: string;
}
export interface GraphData {
  seq: number;
  layoutAt: number;
  ids: string[];
  paths: string[];
  edges: number[];
  positions: (number | null)[];
}
export interface SearchHit {
  id: string;
  path: string;
  title: string;
  snippet: string;
}
export interface Connection {
  id: string;
  app: string;
  workspaceId: string | null;
  workspaceName: string | null;
  canWrite: boolean;
  createdAt: number;
}
export interface AuditEntry {
  actor: { kind: "user" | "app"; id: string; app?: string };
  action: string;
  noteId: string | null;
  at: number;
}
export interface SkillSummary {
  path: string;
  slug: string;
  name: string;
  description: string;
  bundle: string | null;
}

export type SaveResult =
  | { status: "created" | "updated" | "unchanged" | "conflict"; note: NoteMeta }
  | { status: "not_found" };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let workspaceId: string | null = null;
export const setWorkspace = (id: string) => {
  workspaceId = id;
};

async function request<T>(path: string, init: RequestInit = {}, allow: number[] = []): Promise<T> {
  const headers = new Headers(init.headers);
  if (workspaceId) headers.set("x-workspace", workspaceId);
  if (init.body) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  if (!response.ok && !allow.includes(response.status)) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, body.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

export const api = {
  me: () => request<Me>("/api/me"),
  createWorkspace: (name: string) => request<Workspace>("/api/workspaces", send("POST", { name })),
  stats: () => request<{ notes: number; links: number; unresolved: number; tags: number; seq: number }>("/api/stats"),
  graph: () => request<GraphData>("/api/graph"),
  saveLayout: (ids: string[], positions: number[]) => request<{ savedAt: number }>("/api/layout", send("PUT", { ids, positions })),
  search: (q: string) => request<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  suggest: (q: string) => request<{ notes: NoteMeta[] }>(`/api/suggest?q=${encodeURIComponent(q)}`),
  recent: () => request<{ notes: NoteMeta[] }>("/api/notes?limit=30"),
  note: (id: string) => request<Note>(`/api/notes?id=${encodeURIComponent(id)}`),
  noteByPath: (path: string) => request<Note>(`/api/notes?path=${encodeURIComponent(path)}`),
  save: (path: string, body: string, expectedRev?: number) =>
    request<SaveResult>("/api/notes", send("PUT", { path, body, expectedRev }), [404, 409]),
  rename: (id: string, path: string) =>
    request<{ status: string; note?: NoteMeta }>("/api/notes/rename", send("POST", { id, path }), [404, 409]),
  trash: (id: string) => request<{ ok: true }>("/api/notes/trash", send("POST", { id })),
  restore: (id: string) => request<NoteMeta>("/api/notes/restore", send("POST", { id })),
  skills: () => request<{ skills: SkillSummary[] }>("/api/skills"),
  trashList: () => request<{ notes: NoteMeta[] }>("/api/trash"),
  activity: () => request<{ entries: AuditEntry[] }>("/api/activity"),
  connections: () => request<{ connections: Connection[] }>("/api/connections"),
  disconnect: (id: string) => request<{ ok: true }>(`/api/connections?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
};

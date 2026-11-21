import { createWorkspace, listWorkspaces, type User } from "../control/accounts";
import { hosts } from "../config";
import { oauthApi } from "../auth/oauth";
import { actorOf, type Principal } from "../auth/principal";
import { parsePath } from "../lib/paths";

const MAX_NOTE_BYTES = 1024 * 1024;
const MAX_LAYOUT_BYTES = 8 * 1024 * 1024;

const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
const fail = (status: number, error: string) => json({ error }, status);

class BadRequest extends Error {}

async function readJson<T>(request: Request, limit: number): Promise<T> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new BadRequest("too_large");
  const text = await request.text();
  if (text.length > limit) throw new BadRequest("too_large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BadRequest("Body must be JSON");
  }
}

function notePath(raw: unknown): string {
  if (typeof raw !== "string") throw new BadRequest("path is required");
  try {
    return parsePath(raw).path;
  } catch {
    throw new BadRequest("Invalid note path");
  }
}

const text = (raw: unknown, name: string) => {
  if (typeof raw !== "string" || !raw) throw new BadRequest(`${name} is required`);
  return raw;
};

/**
 * JSON API for the signed-in web app. The workspace is the principal's, which `webPrincipal`
 * checked against the user's memberships.
 */
export async function handleApi(request: Request, env: Env, user: User, principal: Principal): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  const workspace = env.WORKSPACE.getByName(principal.workspaceId);
  const actor = actorOf(principal);
  const param = (name: string) => url.searchParams.get(name);

  try {
    switch (route) {
      case "GET /api/me":
        return json({
          user,
          workspaceId: principal.workspaceId,
          workspaces: await listWorkspaces(env.DB, user.id),
          mcpUrl: hosts(env).mcpResource,
        });

      case "POST /api/workspaces": {
        const body = await readJson<{ name?: unknown }>(request, 4096);
        const name = text(body.name, "name").trim().slice(0, 80);
        if (!name) throw new BadRequest("name is required");
        return json(await createWorkspace(env.DB, user.id, name), 201);
      }

      case "GET /api/stats":
        return json(await workspace.stats());

      case "GET /api/search":
        return json({ hits: await workspace.search(param("q") ?? "", 30) });

      case "GET /api/suggest":
        return json({ notes: await workspace.suggestTitles(param("q") ?? "", 10) });

      case "GET /api/notes": {
        const id = param("id");
        const path = param("path");
        if (!id && !path) return json({ notes: await workspace.listRecent(Number(param("limit") ?? 50)) });
        const note = await workspace.getNote(id ? { id } : { path: notePath(path) });
        if (!note) return fail(404, "Note not found");
        const [outgoing, backlinks] = await Promise.all([workspace.outgoing(note.id), workspace.backlinks(note.id)]);
        return json({ ...note, outgoing, backlinks });
      }

      case "PUT /api/notes": {
        const body = await readJson<{ path?: unknown; body?: unknown; expectedRev?: unknown }>(request, MAX_NOTE_BYTES + 4096);
        if (typeof body.body !== "string") throw new BadRequest("body is required");
        if (body.body.length > MAX_NOTE_BYTES) return fail(413, "Note is too large");
        if (body.expectedRev !== undefined && !Number.isInteger(body.expectedRev)) throw new BadRequest("expectedRev must be a whole number");
        const result = await workspace.saveNote({
          path: notePath(body.path),
          body: body.body,
          expectedRev: body.expectedRev as number | undefined,
          actor,
        });
        const status = { created: 201, updated: 200, unchanged: 200, conflict: 409, not_found: 404 }[result.status];
        return json(result, status);
      }

      case "POST /api/notes/rename": {
        const body = await readJson<{ id?: unknown; path?: unknown }>(request, 4096);
        const result = await workspace.renameNote({ id: text(body.id, "id"), path: notePath(body.path), actor });
        return json(result, { renamed: 200, exists: 409, not_found: 404 }[result.status]);
      }

      case "POST /api/notes/trash": {
        const body = await readJson<{ id?: unknown }>(request, 4096);
        return (await workspace.trashNote({ id: text(body.id, "id"), actor })) ? json({ ok: true }) : fail(404, "Note not found");
      }

      case "POST /api/notes/restore": {
        const body = await readJson<{ id?: unknown }>(request, 4096);
        const note = await workspace.restoreNote({ id: text(body.id, "id"), actor });
        return note ? json(note) : fail(404, "Note not found in trash");
      }

      case "GET /api/trash":
        return json({ notes: await workspace.listTrash() });

      case "GET /api/revisions":
        return json({ revisions: await workspace.listRevisions(text(param("id"), "id")) });

      case "GET /api/graph": {
        const graph = await workspace.graph();
        const etag = `"g${graph.seq}-${graph.layoutAt}"`;
        if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
        return json(graph, 200, { etag, "cache-control": "private, no-cache" });
      }

      case "PUT /api/layout": {
        const body = await readJson<{ ids?: unknown; positions?: unknown }>(request, MAX_LAYOUT_BYTES);
        if (!Array.isArray(body.ids) || !body.ids.every((id) => typeof id === "string")) throw new BadRequest("ids are required");
        if (!Array.isArray(body.positions) || body.positions.length !== body.ids.length * 2 || !body.positions.every((n) => typeof n === "number" && Number.isFinite(n))) {
          throw new BadRequest("positions must hold an x and y for each id");
        }
        return json({ savedAt: await workspace.saveLayout(body.ids as string[], body.positions as number[]) });
      }

      case "GET /api/activity":
        return json({ entries: await workspace.listAudit(100) });

      case "GET /api/connections": {
        const oauth = oauthApi(env);
        const { items } = await oauth.listUserGrants(user.id);
        return json({
          connections: items.map((grant) => ({
            id: grant.id,
            app: grant.metadata?.app ?? grant.clientId,
            workspaceId: grant.metadata?.workspaceId ?? null,
            workspaceName: grant.metadata?.workspaceName ?? null,
            canWrite: grant.scope.includes("notes:write"),
            createdAt: grant.createdAt,
          })),
        });
      }

      case "DELETE /api/connections": {
        await oauthApi(env).revokeGrant(text(param("id"), "id"), user.id);
        return json({ ok: true });
      }

      default:
        return fail(404, "Not found");
    }
  } catch (error) {
    if (error instanceof BadRequest) return error.message === "too_large" ? fail(413, "Request is too large") : fail(400, error.message);
    throw error;
  }
}

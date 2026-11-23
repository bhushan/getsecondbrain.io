import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createWorkspace } from "../../src/worker/control/accounts";
import { APP, signIn } from "./helpers";

const put = (api: Awaited<ReturnType<typeof signIn>>["api"], body: unknown) =>
  api("/api/notes", { method: "PUT", body: JSON.stringify(body) });

describe("who may call the API", () => {
  it("refuses a request with no session or a made-up session", async () => {
    expect((await exports.default.fetch(`${APP}/api/stats`)).status).toBe(401);
    const forged = await exports.default.fetch(`${APP}/api/stats`, { headers: { cookie: "__Host-sb_session=made-up" } });
    expect(forged.status).toBe(401);
  });

  it("refuses a write without our own origin", async () => {
    const { cookie } = await signIn();
    const response = await exports.default.fetch(`${APP}/api/notes`, {
      method: "PUT",
      headers: { cookie, origin: "https://evil.example" },
      body: JSON.stringify({ path: "A", body: "x" }),
    });
    expect(response.status).toBe(403);
  });

  it("refuses another user's workspace and accepts the user's own second workspace", async () => {
    const alice = await signIn();
    const bob = await signIn();
    await put(alice.api, { path: "Secret", body: "alice only" });
    const peek = await bob.api("/api/notes?path=Secret", { headers: { "x-workspace": alice.workspaceId } });
    expect(peek.status).toBe(403);

    const second = await createWorkspace(env.DB, bob.user.id, "Work");
    await bob.api("/api/notes", {
      method: "PUT",
      headers: { "x-workspace": second.id },
      body: JSON.stringify({ path: "In work", body: "x" }),
    });
    const inWork = await bob.api("/api/notes?path=In work", { headers: { "x-workspace": second.id } });
    expect(inWork.status).toBe(200);
    expect((await bob.api("/api/notes?path=In work")).status).toBe(404);
  });

  it("describes the signed-in user, workspaces and MCP address", async () => {
    const { api, workspaceId } = await signIn();
    const me = (await (await api("/api/me")).json()) as Record<string, unknown>;
    expect(me).toMatchObject({ workspaceId, mcpUrl: "https://mcp.test/mcp", workspaces: [{ id: workspaceId, role: "owner" }] });
  });
});

describe("notes over the API", () => {
  it("creates, reads with links, updates, and reports a conflict", async () => {
    const { api } = await signIn();
    expect((await put(api, { path: "Api/Note.md", body: "v1 [[Other]]" })).status).toBe(201);
    const read = (await (await api("/api/notes?path=Api/Note")).json()) as Record<string, unknown>;
    expect(read).toMatchObject({ path: "Api/Note", rev: 1, outgoing: [{ ref: "Other", id: null }], backlinks: [] });
    expect((await put(api, { path: "Api/Note", body: "v2", expectedRev: 1 })).status).toBe(200);
    expect((await put(api, { path: "Api/Note", body: "v3", expectedRev: 1 })).status).toBe(409);
  });

  it("renames, trashes and restores", async () => {
    const { api } = await signIn();
    const created = (await (await put(api, { path: "Old", body: "x" })).json()) as { note: { id: string } };
    const id = created.note.id;
    const post = (path: string, body: unknown) => api(path, { method: "POST", body: JSON.stringify(body) });
    expect((await post("/api/notes/rename", { id, path: "New" })).status).toBe(200);
    expect((await post("/api/notes/trash", { id })).status).toBe(200);
    expect((await api(`/api/notes?id=${id}`)).status).toBe(404);
    expect((await post("/api/notes/restore", { id })).status).toBe(200);
    expect((await api("/api/notes?path=New")).status).toBe(200);
  });

  it("deletes trashed notes forever, one at a time or all at once", async () => {
    const { api } = await signIn();
    const post = (path: string, body: unknown) => api(path, { method: "POST", body: JSON.stringify(body) });
    const ids: string[] = [];
    for (const path of ["One", "Two", "Three"]) {
      const created = (await (await put(api, { path, body: "x" })).json()) as { note: { id: string } };
      ids.push(created.note.id);
      await post("/api/notes/trash", { id: created.note.id });
    }
    expect(await (await post("/api/trash/delete", { id: ids[0] })).json()).toEqual({ deleted: 1 });
    expect((await post("/api/trash/delete", { id: ids[0] })).status).toBe(404);
    expect(await (await post("/api/trash/empty", {})).json()).toEqual({ deleted: 2 });
    expect(await (await api("/api/trash")).json()).toEqual({ notes: [] });
  });

  it("never deletes another user's trashed notes", async () => {
    const alice = await signIn();
    const bob = await signIn();
    const created = (await (await put(alice.api, { path: "Mine", body: "x" })).json()) as { note: { id: string } };
    await alice.api("/api/notes/trash", { method: "POST", body: JSON.stringify({ id: created.note.id }) });
    expect((await bob.api("/api/trash/delete", { method: "POST", body: JSON.stringify({ id: created.note.id }) })).status).toBe(404);
    await bob.api("/api/trash/empty", { method: "POST", body: "{}" });
    expect(((await (await alice.api("/api/trash")).json()) as { notes: unknown[] }).notes).toHaveLength(1);
  });

  it("returns 400 for a bad path or body and 413 for a huge note", async () => {
    const { api } = await signIn();
    expect((await api("/api/notes?path=a/../b")).status).toBe(400);
    expect((await put(api, { path: "../x", body: "" })).status).toBe(400);
    expect((await put(api, { path: "NoBody" })).status).toBe(400);
    expect((await api("/api/notes", { method: "PUT", body: "{" })).status).toBe(400);
    expect((await put(api, { path: "Huge", body: "x".repeat(1024 * 1024 + 1) })).status).toBe(413);
  });

  it("measures a body's size in bytes, and stops reading a streamed body once it is too large", async () => {
    const { api } = await signIn();
    const wide = JSON.stringify({ name: "é".repeat(2100) });
    expect(wide.length).toBeLessThan(4096);
    expect((await api("/api/workspaces", { method: "POST", body: wide })).status).toBe(413);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1024;
        if (sent > 64 * 1024) controller.close();
        else controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    expect((await api("/api/workspaces", { method: "POST", body: stream })).status).toBe(413);
    expect(sent).toBeLessThan(64 * 1024);
  });

    it("searches and reports stats", async () => {
    const { api } = await signIn();
    await put(api, { path: "Findable", body: "quokka sighting" });
    const search = (await (await api("/api/search?q=quokka")).json()) as { hits: { path: string }[] };
    expect(search.hits.map((hit) => hit.path)).toEqual(["Findable"]);
    expect(((await (await api("/api/stats")).json()) as { notes: number }).notes).toBe(1);
  });
});

describe("graph", () => {
  it("returns nodes and resolved edges, honours the ETag, and keeps a saved layout", async () => {
    const { api } = await signIn();
    await put(api, { path: "A", body: "[[B]] [[Missing]]" });
    await put(api, { path: "B", body: "[[A]]" });
    const first = await api("/api/graph");
    const graph = (await first.json()) as { ids: string[]; paths: string[]; edges: number[]; positions: (number | null)[] };
    expect(graph.paths).toEqual(["A", "B"]);
    expect(graph.edges).toEqual([0, 1, 1, 0]);
    expect(graph.positions).toEqual([null, null, null, null]);

    const etag = first.headers.get("etag")!;
    expect((await api("/api/graph", { headers: { "if-none-match": etag } })).status).toBe(304);

    const saved = await api("/api/layout", { method: "PUT", body: JSON.stringify({ ids: graph.ids, positions: [1, 2, 3, 4] }) });
    expect(saved.status).toBe(200);
    const after = await api("/api/graph", { headers: { "if-none-match": etag } });
    expect(after.status).toBe(200);
    expect(((await after.json()) as { positions: number[] }).positions).toEqual([1, 2, 3, 4]);
  });

  it("rejects a malformed layout", async () => {
    const { api } = await signIn();
    const bad = await api("/api/layout", { method: "PUT", body: JSON.stringify({ ids: ["a"], positions: [1] }) });
    expect(bad.status).toBe(400);
  });
});

describe("skills over the API", () => {
  it("lets the signed-in user write skills as notes and lists them", async () => {
    const { api } = await signIn();
    expect((await put(api, { path: "Skills/Writing/Blog post", body: "---\nname: Blog post\ndescription: Write a post.\n---\nSteps" })).status).toBe(201);
    const { skills } = (await (await api("/api/skills")).json()) as { skills: unknown[] };
    expect(skills).toEqual([{ path: "Skills/Writing/Blog post", slug: "writing-blog-post", name: "Blog post", description: "Write a post.", bundle: "Writing" }]);
  });

  it("moves a skill to another bundle and saves its new text at the same revision, the way the Skills page edits", async () => {
    const { api } = await signIn();
    const created = (await (await put(api, { path: "Skills/Writing/Post", body: "v1", expectedRev: 0 })).json()) as { note: { id: string; rev: number } };
    const moved = await api("/api/notes/rename", { method: "POST", body: JSON.stringify({ id: created.note.id, path: "Skills/Blog/Post" }) });
    expect(moved.status).toBe(200);
    expect((await put(api, { path: "Skills/Blog/Post", body: "v2", expectedRev: created.note.rev })).status).toBe(200);
    const { skills } = (await (await api("/api/skills")).json()) as { skills: { bundle: string }[] };
    expect(skills).toMatchObject([{ bundle: "Blog" }]);
  });

  it("never lists another user's skills", async () => {
    const alice = await signIn();
    const bob = await signIn();
    await put(alice.api, { path: "Skills/Secret", body: "alice only" });
    expect(((await (await bob.api("/api/skills")).json()) as { skills: unknown[] }).skills).toEqual([]);
    expect((await bob.api("/api/skills", { headers: { "x-workspace": alice.workspaceId } })).status).toBe(403);
  });
});

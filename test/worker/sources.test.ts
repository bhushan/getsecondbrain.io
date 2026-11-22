import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eraseDeletedWorkspaces, RESTORE_DAYS } from "../../src/worker/control/workspaceDeletion";
import { createWorkspace } from "../../src/worker/control/accounts";
import { granolaFetch } from "../../src/worker/sources/granolaClient";
import { sourcesKey } from "../../src/worker/sources/crypto";
import { syncAllSources } from "../../src/worker/sources/schedule";
import { fakeGranola } from "./granola-fake";
import { APP, signIn } from "./helpers";

afterEach(() => vi.restoreAllMocks());

type Who = Awaited<ReturnType<typeof signIn>>;
type Fake = ReturnType<typeof fakeGranola>;

const post = (who: Who, path: string, workspace = who.workspaceId) => who.api(path, { method: "POST", headers: { "x-workspace": workspace } });
const sources = async (who: Who, workspace = who.workspaceId) =>
  ((await (await who.api("/api/sources", { headers: { "x-workspace": workspace } })).json()) as { sources: Record<string, unknown>[] }).sources;
const sync = async (who: Who, workspace = who.workspaceId) => (await (await post(who, "/api/sources/granola/sync", workspace)).json()) as Record<string, unknown>;
const note = async (who: Who, path: string) => {
  const response = await who.api(`/api/notes?path=${encodeURIComponent(path)}`);
  return response.status === 200 ? ((await response.json()) as { id: string; path: string; body: string; rev: number }) : null;
};
const recent = async (who: Who) => ((await (await who.api("/api/notes")).json()) as { notes: { path: string }[] }).notes.map((n) => n.path);

/** Starts the Granola connection in the app; returns where the browser is sent. */
async function startConnect(who: Who, workspace = who.workspaceId) {
  const response = await post(who, "/api/sources/granola/connect", workspace);
  expect(response.status).toBe(200);
  return new URL(((await response.json()) as { url: string }).url);
}

/** Granola sends the browser back to our callback. */
const callback = (cookie: string | null, query: string) =>
  exports.default.fetch(`${APP}/sources/granola/callback?${query}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });

/** Connects Granola to the workspace end to end. */
async function connect(who: Who, workspace = who.workspaceId) {
  const authorize = await startConnect(who, workspace);
  const response = await callback(who.cookie, `code=good-code&state=${authorize.searchParams.get("state")}`);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/sources?connected=granola");
}

const meeting = (id: string, title: string, updatedAt = "2026-11-20T10:00:00Z", extra: Partial<Parameters<Fake["add"]>[0]> = {}) => ({
  id,
  title,
  updatedAt,
  meetingAt: "2026-11-20T15:54:37+05:30",
  ...extra,
});

describe("connecting Granola", () => {
  it("sends the browser to Granola with PKCE, state and our own callback", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    const authorize = await startConnect(who);
    expect(authorize.origin + authorize.pathname).toBe("https://mcp-auth.granola.ai/oauth2/authorize");
    expect(authorize.searchParams.get("client_id")).toBe("granola-client-1");
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${APP}/sources/granola/callback`);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("resource")).toBe("https://mcp.granola.ai/mcp");
    expect(authorize.searchParams.get("scope")).toContain("offline_access");
    expect(authorize.searchParams.get("state")).toBeTruthy();
    const register = fake.calls.find((c) => c.url.endsWith("/oauth2/register"));
    expect(register).toBeTruthy();
  });

  it("refuses a callback with a state it never issued", async () => {
    fakeGranola();
    const who = await signIn();
    const response = await callback(who.cookie, "code=good-code&state=forged");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/sources?error=expired");
    expect(await sources(who)).toEqual([]);
  });

  it("refuses a callback finished by a different signed-in user", async () => {
    fakeGranola();
    const alice = await signIn();
    const mallory = await signIn();
    const authorize = await startConnect(alice);
    const response = await callback(mallory.cookie, `code=good-code&state=${authorize.searchParams.get("state")}`);
    expect(response.status).toBe(403);
    expect(await sources(alice)).toEqual([]);
    expect(await sources(mallory)).toEqual([]);
  });

  it("stores nothing when the user declines at Granola", async () => {
    fakeGranola();
    const who = await signIn();
    const authorize = await startConnect(who);
    const response = await callback(who.cookie, `error=access_denied&state=${authorize.searchParams.get("state")}`);
    expect(response.headers.get("location")).toBe("/sources?error=denied");
    expect(await sources(who)).toEqual([]);
  });

  it("shows the connection without ever returning a token", async () => {
    fakeGranola();
    const who = await signIn();
    await connect(who);
    await sync(who);
    const response = await who.api("/api/sources");
    const text = await response.text();
    expect(text).not.toMatch(/granola-(access|refresh)/);
    expect(JSON.parse(text).sources).toMatchObject([{ provider: "granola", status: "active", account: "ada@example.com", lastError: null }]);
  });

  it("refuses to start without an encryption key", async () => {
    expect(await sourcesKey({ SOURCES_KEY: undefined })).toBeNull();
    expect(await sourcesKey({ SOURCES_KEY: "" })).toBeNull();
    expect(await sourcesKey({ SOURCES_KEY: "dG9vLXNob3J0" })).toBeNull();
    expect(await sourcesKey({ SOURCES_KEY: env.SOURCES_KEY })).not.toBeNull();
  });
});

describe("syncing Granola notes", () => {
  it("writes each meeting to Meetings as the Granola app, across pages", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    for (const [id, title] of [["m-1", "Roadmap"], ["m-2", "Pricing"], ["m-3", "Hiring"]] as const) fake.add(meeting(id, title));
    await connect(who);
    expect(await sync(who)).toMatchObject({ status: "ok", created: 3 });
    expect(fake.toolCalls("search_meetings")).toHaveLength(2);
    const roadmap = await note(who, "Meetings/2026-11-20 Roadmap");
    expect(roadmap?.body).toContain('granola_id: "m-1"');
    expect(roadmap?.body).toContain("- Ship it");
    const activity = (await (await who.api("/api/activity")).json()) as { entries: { actor: { kind: string; app?: string } }[] };
    expect(activity.entries[0]!.actor).toMatchObject({ kind: "app", app: "Granola" });
  });

  it("asks only for changes since the last sync, and writes nothing when there are none", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    await sync(who);
    const first = fake.toolCalls("search_meetings")[0]!.args!.updated_after as string;
    expect(Date.parse(first)).toBeLessThan(Date.parse("2001-01-01T00:00:00Z"));
    expect(await sync(who)).toMatchObject({ status: "ok", created: 0, updated: 0 });
    const second = fake.toolCalls("search_meetings").at(-1)!.args!.updated_after as string;
    expect(second).toMatch(/Z$/);
    expect(Date.parse(second)).toBeGreaterThan(Date.parse("2026-01-01T00:00:00Z"));
  });

  it("updates the same note when the meeting changes, even after the user moved it", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    await sync(who);
    const saved = (await note(who, "Meetings/2026-11-20 Roadmap"))!;
    await who.api("/api/notes/rename", { method: "POST", body: JSON.stringify({ id: saved.id, path: "Work/Roadmap call" }) });
    fake.add(meeting("m-1", "Roadmap v2", "2099-01-01T00:00:00Z", { summary: "- New plan" }));
    expect(await sync(who)).toMatchObject({ updated: 1, created: 0 });
    const moved = (await note(who, "Work/Roadmap call"))!;
    expect(moved.id).toBe(saved.id);
    expect(moved.body).toContain("- New plan");
    expect((await recent(who)).filter((p) => p.startsWith("Meetings/") && p !== "Meetings/Meetings")).toEqual([]);
  });

  it("never overwrites a note the user edited, and never brings back a trashed one", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Edited"));
    fake.add(meeting("m-2", "Trashed"));
    await connect(who);
    await sync(who);
    const edited = (await note(who, "Meetings/2026-11-20 Edited"))!;
    await who.api("/api/notes", { method: "PUT", body: JSON.stringify({ path: edited.path, body: "my own version" }) });
    const trashed = (await note(who, "Meetings/2026-11-20 Trashed"))!;
    await who.api("/api/notes/trash", { method: "POST", body: JSON.stringify({ id: trashed.id }) });
    fake.add(meeting("m-1", "Edited", "2099-01-01T00:00:00Z", { summary: "- from Granola" }));
    fake.add(meeting("m-2", "Trashed", "2099-01-01T00:00:00Z", { summary: "- from Granola" }));
    expect(await sync(who)).toMatchObject({ updated: 0, created: 0, skipped: 2 });
    expect((await note(who, edited.path))!.body).toBe("my own version");
    expect(await note(who, trashed.path)).toBeNull();
  });

  it("creates one Meetings hub that every meeting note links to", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    fake.add(meeting("m-2", "Pricing"));
    await connect(who);
    await sync(who);
    await sync(who);
    const hub = (await (await who.api(`/api/notes?path=${encodeURIComponent("Meetings/Meetings")}`)).json()) as { backlinks: { path: string }[]; rev: number };
    expect(hub.backlinks.map((n) => n.path).sort()).toEqual(["Meetings/2026-11-20 Pricing", "Meetings/2026-11-20 Roadmap"]);
    expect(hub.rev).toBe(1);
    expect(await note(who, "Meetings")).toBeNull();
  });

  it("leaves the user's own Meetings hub as it is", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    await who.api("/api/notes", { method: "PUT", body: JSON.stringify({ path: "Meetings/Meetings", body: "my hub" }) });
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    await sync(who);
    expect((await note(who, "Meetings/Meetings"))!.body).toBe("my hub");
  });

  it("adopts a meeting note the Obsidian plugin already wrote, instead of copying it", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    const plugin = "---\ngranola_id: not_abc\ntitle: Roadmap\ntype: note\n---\n# Hand-curated summary";
    await who.api("/api/notes", { method: "PUT", body: JSON.stringify({ path: "Meetings/2026-11-20 Roadmap", body: plugin }) });
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    expect(await sync(who)).toMatchObject({ created: 0, adopted: 1 });
    fake.add(meeting("m-1", "Roadmap", "2099-01-01T00:00:00Z", { summary: "- newer" }));
    await sync(who);
    expect((await note(who, "Meetings/2026-11-20 Roadmap"))!.body).toBe(plugin);
    expect((await recent(who)).filter((p) => p.startsWith("Meetings/2026-11-20 Roadmap"))).toEqual(["Meetings/2026-11-20 Roadmap"]);
  });

  it("does not adopt a note at the same path that did not come from Granola", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    await who.api("/api/notes", { method: "PUT", body: JSON.stringify({ path: "Meetings/2026-11-20 Roadmap", body: "my own note" }) });
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    expect(await sync(who)).toMatchObject({ created: 1 });
    expect((await note(who, "Meetings/2026-11-20 Roadmap (2)"))!.body).toContain('granola_id: "m-1"');
  });

  it("asks again, one by one, for meetings missing from a batch", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    fake.add(meeting("m-2", "Pricing"));
    fake.dropFromBatch.add("m-2");
    await connect(who);
    expect(await sync(who)).toMatchObject({ status: "ok", created: 2 });
  });

  it("does not move past a meeting Granola would not return, so the next sync tries again", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    fake.add(meeting("m-2", "Pricing"));
    fake.neverReturn.add("m-2");
    await connect(who);
    expect(await sync(who)).toMatchObject({ status: "error" });
    fake.neverReturn.clear();
    expect(await sync(who)).toMatchObject({ status: "ok", created: 1 });
    expect(await note(who, "Meetings/2026-11-20 Pricing")).not.toBeNull();
  });

  it("stops at a workspace limit with a reason, and syncs the rest once there is room", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    await env.WORKSPACE.getByName(who.workspaceId).setLimits({ writesPerDay: 0 });
    const refused = await sync(who);
    expect(refused).toMatchObject({ status: "error" });
    expect(String(refused.error)).toMatch(/limit/i);
    await env.WORKSPACE.getByName(who.workspaceId).setLimits({ writesPerDay: 100 });
    expect(await sync(who)).toMatchObject({ status: "ok", created: 1 });
  });

  it("keeps meeting notes after Granola stops sharing them", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    await sync(who);
    fake.meetings.clear();
    expect(await sync(who)).toMatchObject({ status: "ok" });
    expect(await note(who, "Meetings/2026-11-20 Roadmap")).not.toBeNull();
  });

  it("keeps two meetings with the same day and title apart", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Standup"));
    fake.add(meeting("m-2", "Standup"));
    await connect(who);
    expect(await sync(who)).toMatchObject({ created: 2 });
    expect((await recent(who)).filter((p) => p.startsWith("Meetings/2026-11-20 Standup")).sort()).toEqual([
      "Meetings/2026-11-20 Standup",
      "Meetings/2026-11-20 Standup (2)",
    ]);
  });

  it("keeps a hostile title inside Meetings and never writes a skill", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "../Skills/evil"));
    await connect(who);
    await sync(who);
    expect((await recent(who)).every((p) => p === "Meetings" || p.startsWith("Meetings/"))).toBe(true);
    expect(((await (await who.api("/api/skills")).json()) as { skills: unknown[] }).skills).toEqual([]);
  });
});

describe("keeping the Granola connection alive", () => {
  it("saves the rotated refresh token, so the next sync still works", async () => {
    const fake = fakeGranola();
    fake.expiresIn = 0;
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    expect(await sync(who)).toMatchObject({ status: "ok" });
    expect(await sync(who)).toMatchObject({ status: "ok" });
    const refreshes = fake.calls.filter((c) => c.form?.grant_type === "refresh_token");
    expect(refreshes).toHaveLength(2);
    expect(refreshes[0]!.form!.refresh_token).not.toBe(refreshes[1]!.form!.refresh_token);
  });

  it("asks the user to reconnect when Granola revokes access", async () => {
    const fake = fakeGranola();
    fake.expiresIn = 0;
    const who = await signIn();
    await connect(who);
    fake.tokenFailure = { status: 400, body: { error: "invalid_grant" } };
    expect(await sync(who)).toMatchObject({ status: "reconnect" });
    expect(await sources(who)).toMatchObject([{ status: "reconnect" }]);
    const mcpCalls = fake.calls.filter((c) => c.url === "https://mcp.granola.ai/mcp").length;
    fake.tokenFailure = null;
    expect(await sync(who)).toMatchObject({ status: "reconnect" });
    expect(fake.calls.filter((c) => c.url === "https://mcp.granola.ai/mcp")).toHaveLength(mcpCalls);
  });

  it("asks the user to reconnect when the stored token can no longer be opened", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    await connect(who);
    // As if the sealing key had changed since the connection was made.
    await runInDurableObject(env.WORKSPACE.getByName(who.workspaceId), (_instance, state) => {
      state.storage.sql.exec("UPDATE sources SET tokens = ?", btoa("x".repeat(40)));
    });
    expect(await sync(who)).toMatchObject({ status: "reconnect" });
    expect(await sources(who)).toMatchObject([{ status: "reconnect" }]);
    expect(fake.calls.filter((c) => c.url === "https://mcp.granola.ai/mcp")).toEqual([]);
  });

  it("keeps trying after an outage, and catches up once Granola is back", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    fake.mcpStatus = 503;
    expect(await sync(who)).toMatchObject({ status: "error" });
    expect(await sources(who)).toMatchObject([{ status: "active", lastError: expect.any(String) }]);
    fake.mcpStatus = null;
    expect(await sync(who)).toMatchObject({ status: "ok", created: 1 });
    expect(await sources(who)).toMatchObject([{ status: "active", lastError: null }]);
  });

  it("revokes the token at Granola on disconnect and keeps the notes", async () => {
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    await sync(who);
    const response = await who.api("/api/sources/granola", { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(fake.calls.some((c) => c.url.endsWith("/oauth2/revoke"))).toBe(true);
    expect(fake.refreshTokens.size).toBe(0);
    expect(await sources(who)).toEqual([]);
    expect(await note(who, "Meetings/2026-11-20 Roadmap")).not.toBeNull();
  });
});

describe("workspace isolation for sources", () => {
  it("never lets workspace B see, sync into or disconnect workspace A's Granola", async () => {
    const fake = fakeGranola();
    const alice = await signIn();
    const bob = await signIn();
    fake.add(meeting("m-1", "Alice only"));
    await connect(alice);
    expect(await sources(bob)).toEqual([]);
    expect((await bob.api("/api/sources", { headers: { "x-workspace": alice.workspaceId } })).status).toBe(403);
    expect((await post(bob, "/api/sources/granola/sync", alice.workspaceId)).status).toBe(403);
    expect(await sync(bob)).toMatchObject({ status: "not_connected" });
    expect((await bob.api("/api/sources/granola", { method: "DELETE", headers: { "x-workspace": alice.workspaceId } })).status).toBe(403);
    await sync(alice);
    expect(await recent(bob)).toEqual([]);
    expect(await sources(alice)).toMatchObject([{ status: "active" }]);
  });

  it("connects to the workspace chosen in the app, not to the user's other one", async () => {
    fakeGranola();
    const who = await signIn();
    const work = await createWorkspace(env.DB, who.user.id, "Work");
    await connect(who, work.id);
    expect(await sources(who, work.id)).toMatchObject([{ provider: "granola" }]);
    expect(await sources(who)).toEqual([]);
  });
});

describe("the hourly sync job", () => {
  it("syncs every connected workspace and skips deleted ones", async () => {
    const fake = fakeGranola();
    const live = await signIn();
    const gone = await signIn();
    const goneWork = await createWorkspace(env.DB, gone.user.id, "Old");
    fake.add(meeting("m-1", "Roadmap"));
    await connect(live);
    await connect(gone, goneWork.id);
    await env.DB.prepare("UPDATE workspaces SET deleted_at = ? WHERE id = ?").bind(Date.now(), goneWork.id).run();
    await syncAllSources(env);
    expect(await note(live, "Meetings/2026-11-20 Roadmap")).not.toBeNull();
    expect((await env.WORKSPACE.getByName(goneWork.id).sourceStatus())[0]!.lastSyncAt).toBeNull();
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM source_connections WHERE workspace_id = ?").bind(goneWork.id).first<{ n: number }>();
    expect(row!.n).toBe(1);
    await eraseDeletedWorkspaces(env, Date.now() + (RESTORE_DAYS + 1) * 24 * 60 * 60 * 1000);
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM source_connections WHERE workspace_id = ?").bind(goneWork.id).first<{ n: number }>();
    expect(after!.n).toBe(0);
  });
});

describe("outbound requests", () => {
  it("only ever reaches Granola's own hosts", async () => {
    await expect(granolaFetch("https://evil.example.com/oauth2/token", {})).rejects.toThrow();
    await expect(granolaFetch("http://mcp.granola.ai/mcp", {})).rejects.toThrow();
    const fake = fakeGranola();
    const who = await signIn();
    fake.add(meeting("m-1", "Roadmap"));
    await connect(who);
    await sync(who);
    expect(fake.otherHosts()).toEqual([]);
  });
});

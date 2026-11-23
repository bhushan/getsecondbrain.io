import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createWorkspace } from "../../src/worker/control/accounts";
import { eraseDeletedWorkspaces, RESTORE_DAYS } from "../../src/worker/control/workspaceDeletion";
import { signIn } from "./helpers";

type Api = Awaited<ReturnType<typeof signIn>>["api"];
const DAY = 24 * 60 * 60 * 1000;
const send = (method: string, body: unknown, workspace?: string): RequestInit => ({
  method,
  body: JSON.stringify(body),
  headers: workspace ? { "x-workspace": workspace } : {},
});
const me = async (api: Api) => (await (await api("/api/me")).json()) as { workspaces: { id: string; name: string }[] };
const put = (api: Api, workspace: string, path: string, body: string) => api("/api/notes", send("PUT", { path, body }, workspace));

/** A signed-in user with a second workspace, so either one may be deleted. */
async function withTwo() {
  const who = await signIn();
  const second = await createWorkspace(env.DB, who.user.id, "Work");
  return { ...who, second };
}

describe("renaming a workspace", () => {
  it("renames the current workspace and trims the name", async () => {
    const { api, workspaceId } = await signIn();
    const response = await api("/api/workspace", send("PATCH", { name: "  Personal  " }, workspaceId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: workspaceId, name: "Personal" });
    expect((await me(api)).workspaces).toMatchObject([{ id: workspaceId, name: "Personal" }]);
  });

  it("refuses an empty name", async () => {
    const { api } = await signIn();
    expect((await api("/api/workspace", send("PATCH", { name: "   " }))).status).toBe(400);
  });

  it("cannot rename another user's workspace", async () => {
    const alice = await signIn();
    const bob = await signIn();
    expect((await bob.api("/api/workspace", send("PATCH", { name: "Mine now" }, alice.workspaceId))).status).toBe(403);
    expect((await me(alice.api)).workspaces[0]!.name).toBe("My second brain");
  });
});

describe("who may change a workspace", () => {
  it("lets a member who is not the owner neither rename nor delete it", async () => {
    const owner = await withTwo();
    const member = await signIn();
    await env.DB.prepare("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'member', ?)")
      .bind(member.user.id, owner.second.id, Date.now())
      .run();
    expect((await member.api("/api/workspace", send("PATCH", { name: "Taken" }, owner.second.id))).status).toBe(403);
    expect((await member.api("/api/workspace", send("DELETE", { confirm: "Work" }, owner.second.id))).status).toBe(403);
    expect((await me(owner.api)).workspaces.find((w) => w.id === owner.second.id)?.name).toBe("Work");
  });
});

describe("deleting a workspace", () => {
  it("refuses unless the exact workspace name is typed", async () => {
    const { api, second } = await withTwo();
    expect((await api("/api/workspace", send("DELETE", { confirm: "work" }, second.id))).status).toBe(400);
    expect((await me(api)).workspaces.map((w) => w.id)).toContain(second.id);
  });

  it("refuses to delete the user's only workspace", async () => {
    const { api, workspaceId } = await signIn();
    expect((await api("/api/workspace", send("DELETE", { confirm: "My second brain" }, workspaceId))).status).toBe(409);
  });

  it("cannot delete another user's workspace", async () => {
    const alice = await withTwo();
    const bob = await signIn();
    expect((await bob.api("/api/workspace", send("DELETE", { confirm: "Work" }, alice.second.id))).status).toBe(403);
    expect((await me(alice.api)).workspaces.map((w) => w.id)).toContain(alice.second.id);
  });

  it("hides the workspace at once and lists it as recoverable", async () => {
    const { api, second } = await withTwo();
    await put(api, second.id, "Plans", "secret plans");
    expect((await api("/api/workspace", send("DELETE", { confirm: "Work" }, second.id))).status).toBe(200);
    expect((await me(api)).workspaces.map((w) => w.id)).not.toContain(second.id);
    expect((await api("/api/notes?path=Plans", { headers: { "x-workspace": second.id } })).status).toBe(403);
    const deleted = (await (await api("/api/workspaces/deleted")).json()) as { workspaces: { id: string; name: string; eraseAt: number }[] };
    expect(deleted.workspaces).toMatchObject([{ id: second.id, name: "Work" }]);
    expect(deleted.workspaces[0]!.eraseAt).toBeGreaterThan(Date.now() + (RESTORE_DAYS - 1) * DAY);
  });

  it("restores a deleted workspace with its notes", async () => {
    const { api, second } = await withTwo();
    await put(api, second.id, "Plans", "secret plans");
    await api("/api/workspace", send("DELETE", { confirm: "Work" }, second.id));
    expect((await api("/api/workspaces/restore", send("POST", { id: second.id }))).status).toBe(200);
    expect((await me(api)).workspaces.map((w) => w.id)).toContain(second.id);
    const note = (await (await api("/api/notes?path=Plans", { headers: { "x-workspace": second.id } })).json()) as { body: string };
    expect(note.body).toBe("secret plans");
  });

  it("never lists or restores another user's deleted workspace", async () => {
    const alice = await withTwo();
    await alice.api("/api/workspace", send("DELETE", { confirm: "Work" }, alice.second.id));
    const bob = await signIn();
    const deleted = (await (await bob.api("/api/workspaces/deleted")).json()) as { workspaces: unknown[] };
    expect(deleted.workspaces).toEqual([]);
    expect((await bob.api("/api/workspaces/restore", send("POST", { id: alice.second.id }))).status).toBe(404);
    expect((await me(bob.api)).workspaces.map((w) => w.id)).not.toContain(alice.second.id);
  });

  it("cannot restore once the recovery period has passed", async () => {
    const { api, second } = await withTwo();
    await api("/api/workspace", send("DELETE", { confirm: "Work" }, second.id));
    await env.DB.prepare("UPDATE workspaces SET deleted_at = ? WHERE id = ?").bind(Date.now() - (RESTORE_DAYS + 1) * DAY, second.id).run();
    expect((await api("/api/workspaces/restore", send("POST", { id: second.id }))).status).toBe(404);
  });
});

describe("erasing deleted workspaces", () => {
  it("erases notes and records of workspaces deleted more than the recovery period ago, and keeps newer ones", async () => {
    const old = await withTwo();
    const recent = await withTwo();
    await put(old.api, old.second.id, "Plans", "secret plans");
    await put(recent.api, recent.second.id, "Keep", "keep me");
    await old.api("/api/workspace", send("DELETE", { confirm: "Work" }, old.second.id));
    await recent.api("/api/workspace", send("DELETE", { confirm: "Work" }, recent.second.id));
    await env.DB.prepare("UPDATE workspaces SET deleted_at = ? WHERE id = ?").bind(Date.now() - (RESTORE_DAYS + 1) * DAY, old.second.id).run();

    expect(await eraseDeletedWorkspaces(env, Date.now())).toBeGreaterThanOrEqual(1);

    const tables = await runInDurableObject(env.WORKSPACE.getByName(old.second.id), (_, state) =>
      state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf%' ESCAPE '\\'").toArray(),
    );
    expect(tables).toEqual([]);
    expect(await env.DB.prepare("SELECT id FROM workspaces WHERE id = ?").bind(old.second.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT 1 FROM memberships WHERE workspace_id = ?").bind(old.second.id).first()).toBeNull();
    expect((await old.api("/api/workspaces/deleted").then((r) => r.json())) as unknown).toEqual({ workspaces: [] });

    expect((await recent.api("/api/workspaces/restore", send("POST", { id: recent.second.id }))).status).toBe(200);
    const kept = (await (await recent.api("/api/notes?path=Keep", { headers: { "x-workspace": recent.second.id } })).json()) as { body: string };
    expect(kept.body).toBe("keep me");
  });
});

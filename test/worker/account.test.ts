import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createWorkspace, upsertGoogleUser } from "../../src/worker/control/accounts";
import { signIn } from "./helpers";

const send = (method: string, body: unknown, workspace?: string): RequestInit => ({
  method,
  body: JSON.stringify(body),
  headers: workspace ? { "x-workspace": workspace } : {},
});
const count = async (sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(...binds).first<number>("n");
const tables = (workspaceId: string) =>
  runInDurableObject(env.WORKSPACE.getByName(workspaceId), (_, state) =>
    state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf%' ESCAPE '\\'").toArray(),
  );

describe("deleting an account", () => {
  it("refuses unless the account's email is typed", async () => {
    const who = await signIn();
    expect((await who.api("/api/account", send("DELETE", { confirm: "someone else" }))).status).toBe(400);
    expect((await who.api("/api/me")).status).toBe(200);
  });

  it("erases every workspace the user owns, with its notes, and signs them out", async () => {
    const who = await signIn();
    const work = await createWorkspace(env.DB, who.user.id, "Work");
    await who.api("/api/notes", send("PUT", { path: "Plans", body: "secret" }));
    await who.api("/api/notes", send("PUT", { path: "Work plans", body: "secret" }, work.id));
    // A workspace already deleted and waiting for its erase goes too.
    await who.api("/api/workspace", send("DELETE", { confirm: "Work" }, work.id));

    const response = await who.api("/api/account", send("DELETE", { confirm: who.user.email.toUpperCase() }));
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().some((c) => c.startsWith("__Host-sb_session=") && c.includes("Max-Age=0"))).toBe(true);

    expect((await who.api("/api/me")).status).toBe(401);
    expect(await tables(who.workspaceId)).toEqual([]);
    expect(await tables(work.id)).toEqual([]);
    expect(await count("SELECT COUNT(*) AS n FROM users WHERE id = ?", who.user.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM workspaces WHERE owner_id = ?", who.user.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM memberships WHERE user_id = ?", who.user.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", who.user.id)).toBe(0);
  });

  it("leaves other people's accounts, workspaces and notes alone", async () => {
    const alice = await signIn();
    const bob = await signIn();
    await bob.api("/api/notes", send("PUT", { path: "Mine", body: "bob's" }));
    await alice.api("/api/account", send("DELETE", { confirm: alice.user.email }));
    expect((await bob.api("/api/me")).status).toBe(200);
    const note = (await (await bob.api("/api/notes?path=Mine")).json()) as { body: string };
    expect(note.body).toBe("bob's");
  });

  it("removes the user from someone else's workspace without touching that workspace", async () => {
    const owner = await signIn();
    const member = await signIn();
    await env.DB.prepare("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'member', ?)")
      .bind(member.user.id, owner.workspaceId, Date.now())
      .run();
    await owner.api("/api/notes", send("PUT", { path: "Shared", body: "ours" }));
    await member.api("/api/account", send("DELETE", { confirm: member.user.email }));
    expect(await count("SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ?", owner.workspaceId)).toBe(1);
    expect((await owner.api("/api/notes?path=Shared")).status).toBe(200);
  });

  it("gives a fresh, empty account to the same Google account signing in again", async () => {
    const who = await signIn();
    await who.api("/api/notes", send("PUT", { path: "Old", body: "old" }));
    await who.api("/api/account", send("DELETE", { confirm: who.user.email }));
    const again = await upsertGoogleUser(env.DB, { sub: "sub-again", email: who.user.email, name: "Again" });
    expect(again.id).not.toBe(who.user.id);
  });
});

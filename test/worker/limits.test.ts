import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createWorkspace } from "../../src/worker/control/accounts";
import { DEFAULT_LIMITS, MAX_WORKSPACES } from "../../src/worker/workspace/limits";
import type { Actor } from "../../src/worker/workspace/types";
import { signIn } from "./helpers";

const me: Actor = { kind: "user", id: "user-1" };
const app: Actor = { kind: "app", id: "grant-1", app: "Claude" };
const workspace = () => env.WORKSPACE.getByName(`limits-${crypto.randomUUID()}`);
const save = (ws: ReturnType<typeof workspace>, path: string, body = "x", actor = me, expectedRev?: number) => ws.saveNote({ path, body, expectedRev, actor });
const send = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

describe("default limits", () => {
  it("sit well above one heavy user's vault and day", () => {
    expect(DEFAULT_LIMITS.notes).toBeGreaterThanOrEqual(10_000);
    expect(DEFAULT_LIMITS.bytes).toBeGreaterThanOrEqual(100 * 1024 * 1024);
    expect(DEFAULT_LIMITS.writesPerDay).toBeGreaterThanOrEqual(2_000);
    expect(MAX_WORKSPACES).toBeGreaterThanOrEqual(10);
  });
});

describe("notes per workspace", () => {
  it("refuses a new note at the cap but still lets existing notes change", async () => {
    const ws = workspace();
    await ws.setLimits({ notes: 2 });
    await save(ws, "A");
    await save(ws, "B");
    expect(await save(ws, "C")).toEqual({ status: "limit", limit: "notes" });
    expect(await save(ws, "A", "changed", me, 1)).toMatchObject({ status: "updated" });
  });

  it("counts trashed notes until they are deleted forever", async () => {
    const ws = workspace();
    await ws.setLimits({ notes: 1 });
    const first = await save(ws, "A");
    if (first.status !== "created") throw new Error("not created");
    await ws.trashNote({ id: first.note.id, actor: me });
    expect(await save(ws, "B")).toEqual({ status: "limit", limit: "notes" });
    await ws.deleteForever({ ids: "all", actor: me });
    expect(await save(ws, "B")).toMatchObject({ status: "created" });
  });
});

describe("storage per workspace", () => {
  it("refuses saves once the workspace's database is over its size, but trash and delete forever still work", async () => {
    const ws = workspace();
    const first = await save(ws, "A");
    if (first.status !== "created") throw new Error("not created");
    await ws.setLimits({ bytes: 1 });
    expect(await save(ws, "B")).toEqual({ status: "limit", limit: "storage" });
    expect(await save(ws, "A", "more", me, 1)).toEqual({ status: "limit", limit: "storage" });
    expect(await ws.trashNote({ id: first.note.id, actor: me })).toBe(true);
    expect(await ws.deleteForever({ ids: "all", actor: me })).toBe(1);
  });
});

describe("writes per day", () => {
  it("refuses saves and renames past the daily cap, from people and apps alike", async () => {
    const ws = workspace();
    await ws.setLimits({ writesPerDay: 2 });
    const first = await save(ws, "A");
    if (first.status !== "created") throw new Error("not created");
    await save(ws, "B", "x", app);
    expect(await save(ws, "C", "x", app)).toEqual({ status: "limit", limit: "writes" });
    expect(await ws.renameNote({ id: first.note.id, path: "Z", actor: me })).toEqual({ status: "limit", limit: "writes" });
  });

  it("does not count a save that changed nothing", async () => {
    const ws = workspace();
    await ws.setLimits({ writesPerDay: 1 });
    await save(ws, "A", "same");
    expect(await save(ws, "A", "same")).toMatchObject({ status: "unchanged" });
  });

  it("starts a fresh count each day (UTC)", async () => {
    const ws = workspace();
    await ws.setLimits({ writesPerDay: 1 });
    await save(ws, "A");
    expect(await save(ws, "B")).toEqual({ status: "limit", limit: "writes" });
    await runInDurableObject(ws, (_, state) => {
      state.storage.sql.exec("UPDATE meta SET value = '2000-01-01' WHERE key = 'writes_day'");
    });
    expect(await save(ws, "B")).toMatchObject({ status: "created" });
  });

  it("reports what is used and allowed", async () => {
    const ws = workspace();
    await ws.setLimits({ notes: 5 });
    await save(ws, "A");
    expect(await ws.usage()).toMatchObject({ notes: 1, writesToday: 1, limits: { notes: 5, writesPerDay: DEFAULT_LIMITS.writesPerDay } });
    expect((await ws.usage()).bytes).toBeGreaterThan(0);
  });
});

describe("limits through the web API", () => {
  it("answers a refused save with a reason the app can show", async () => {
    const who = await signIn();
    await env.WORKSPACE.getByName(who.workspaceId).setLimits({ writesPerDay: 0 });
    const response = await who.api("/api/notes", send("PUT", { path: "A", body: "x" }));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ status: "limit", limit: "writes" });
  });

  it("refuses a new note at the note cap with 507", async () => {
    const who = await signIn();
    await env.WORKSPACE.getByName(who.workspaceId).setLimits({ notes: 0 });
    expect((await who.api("/api/notes", send("PUT", { path: "A", body: "x" }))).status).toBe(507);
  });

  it("caps how many workspaces one person can create", async () => {
    const who = await signIn();
    for (let i = 1; i < MAX_WORKSPACES; i++) await createWorkspace(env.DB, who.user.id, `W${i}`);
    const response = await who.api("/api/workspaces", send("POST", { name: "One too many" }));
    expect(response.status).toBe(409);
    const other = await signIn();
    expect((await other.api("/api/workspaces", send("POST", { name: "Mine" }))).status).toBe(201);
  });

  it("shows the signed-in workspace's usage, never another's", async () => {
    const alice = await signIn();
    const bob = await signIn();
    await alice.api("/api/notes", send("PUT", { path: "A", body: "x" }));
    const usage = (await (await bob.api("/api/usage")).json()) as { notes: number };
    expect(usage.notes).toBe(0);
    expect((await (await alice.api("/api/usage")).json()) as { notes: number }).toMatchObject({ notes: 1 });
  });
});

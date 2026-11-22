import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Actor } from "../../src/worker/workspace/types";

const me: Actor = { kind: "user", id: "user-1" };
let counter = 0;
/** A fresh, empty workspace for each test. */
const workspace = () => env.WORKSPACE.getByName(`test-${++counter}-${crypto.randomUUID()}`);

async function save(ws: ReturnType<typeof workspace>, path: string, body = "", expectedRev?: number) {
  const result = await ws.saveNote({ path, body, expectedRev, actor: me });
  // Tests that expect "not_found" compare the whole result and never read `note`.
  return result as Exclude<typeof result, { status: "not_found" }>;
}

describe("saving and reading notes", () => {
  it("creates a note at revision 1 and reads it back by path and by id", async () => {
    const ws = workspace();
    const result = await save(ws, "Projects/Alpha", "Hello");
    expect(result.status).toBe("created");
    expect(result.note).toMatchObject({ path: "Projects/Alpha", title: "Alpha", rev: 1 });
    expect(await ws.getNote({ path: "projects/alpha.md" })).toMatchObject({ id: result.note.id, body: "Hello" });
    expect(await ws.getNote({ id: result.note.id })).toMatchObject({ path: "Projects/Alpha" });
  });

  it("updates a note, bumps the revision and keeps the old body as a revision", async () => {
    const ws = workspace();
    const { note } = await save(ws, "A", "one");
    const updated = await save(ws, "A", "two", 1);
    expect(updated).toMatchObject({ status: "updated", note: { id: note.id, rev: 2 } });
    expect(await ws.listRevisions(note.id)).toMatchObject([{ rev: 1, body: "one", actor: me }]);
  });

  it("writes nothing when the body is unchanged", async () => {
    const ws = workspace();
    await save(ws, "A", "same");
    const before = (await ws.stats()).seq;
    expect(await save(ws, "A", "same")).toMatchObject({ status: "unchanged", note: { rev: 1 } });
    expect((await ws.stats()).seq).toBe(before);
  });

  it("reports a conflict when the expected revision is stale, and changes nothing", async () => {
    const ws = workspace();
    await save(ws, "A", "one");
    await save(ws, "A", "two");
    const result = await save(ws, "A", "three", 1);
    expect(result).toMatchObject({ status: "conflict", note: { rev: 2 } });
    expect(await ws.getNote({ path: "A" })).toMatchObject({ body: "two", rev: 2 });
  });

  it("treats expected revision 0 as create-only", async () => {
    const ws = workspace();
    await save(ws, "A", "one");
    expect((await save(ws, "A", "other", 0)).status).toBe("conflict");
  });

  it("reports not found when updating a note that does not exist", async () => {
    const ws = workspace();
    expect(await save(ws, "Missing", "text", 3)).toEqual({ status: "not_found" });
  });

  it("lists notes most recently updated first", async () => {
    const ws = workspace();
    await save(ws, "A", "a");
    await save(ws, "B", "b");
    await save(ws, "A", "a2");
    expect((await ws.listRecent(10)).map((note) => note.path)).toEqual(["A", "B"]);
  });
});

describe("links and backlinks", () => {
  it("resolves a link to an existing note and lists it as a backlink", async () => {
    const ws = workspace();
    const target = (await save(ws, "Target")).note;
    const source = (await save(ws, "Source", "See [[target|the target]].")).note;
    expect(await ws.backlinks(target.id)).toMatchObject([{ id: source.id, path: "Source" }]);
    expect(await ws.outgoing(source.id)).toEqual([{ ref: "target", embed: false, id: target.id, path: "Target" }]);
  });

  it("keeps an unresolved link and resolves it when the note appears", async () => {
    const ws = workspace();
    const source = (await save(ws, "Source", "See [[Later]].")).note;
    expect(await ws.outgoing(source.id)).toEqual([{ ref: "Later", embed: false, id: null, path: null }]);
    const later = (await save(ws, "Folder/Later")).note;
    expect(await ws.backlinks(later.id)).toMatchObject([{ id: source.id }]);
  });

  it("drops links that were removed from the body", async () => {
    const ws = workspace();
    const target = (await save(ws, "Target")).note;
    await save(ws, "Source", "[[Target]]");
    await save(ws, "Source", "no links now");
    expect(await ws.backlinks(target.id)).toEqual([]);
  });

  it("resolves a path-qualified link to the exact note when titles collide", async () => {
    const ws = workspace();
    const a = (await save(ws, "One/README")).note;
    const b = (await save(ws, "Two/README")).note;
    const source = (await save(ws, "Index", "[[Two/README]] and [[One/README]]")).note;
    expect((await ws.outgoing(source.id)).map((link) => link.id)).toEqual([b.id, a.id]);
  });

  it("prefers the note in the same folder when a bare title is ambiguous", async () => {
    const ws = workspace();
    await save(ws, "One/README");
    const near = (await save(ws, "Two/README")).note;
    const source = (await save(ws, "Two/Index", "[[README]]")).note;
    expect((await ws.outgoing(source.id))[0]?.id).toBe(near.id);
  });

  it("returns notes within k hops in either direction, nearest first", async () => {
    const ws = workspace();
    const a = (await save(ws, "A", "[[B]]")).note;
    await save(ws, "B", "[[C]]");
    await save(ws, "C", "[[D]]");
    await save(ws, "D");
    await save(ws, "Z", "[[A]]");
    const one = await ws.linked(a.id, 1);
    expect(one.map((n) => [n.path, n.depth])).toEqual([["B", 1], ["Z", 1]]);
    const two = await ws.linked(a.id, 2);
    expect(two.map((n) => [n.path, n.depth])).toEqual([["B", 1], ["Z", 1], ["C", 2]]);
  });
});

describe("renaming", () => {
  it("moves the note, rewrites links in other notes and keeps backlinks", async () => {
    const ws = workspace();
    const target = (await save(ws, "Old Name")).note;
    const source = (await save(ws, "Source", "[[Old Name]] and [[Old Name#Part|alias]]")).note;
    const renamed = await ws.renameNote({ id: target.id, path: "Archive/New Name", actor: me });
    expect(renamed).toMatchObject({ status: "renamed", note: { path: "Archive/New Name", title: "New Name" } });
    expect(await ws.getNote({ id: source.id })).toMatchObject({
      body: "[[New Name]] and [[New Name#Part|alias]]",
      rev: 2,
    });
    expect(await ws.backlinks(target.id)).toMatchObject([{ id: source.id }]);
    expect(await ws.getNote({ path: "Old Name" })).toBeNull();
  });

  it("refuses to rename onto an existing note", async () => {
    const ws = workspace();
    const a = (await save(ws, "A")).note;
    await save(ws, "B");
    expect(await ws.renameNote({ id: a.id, path: "B", actor: me })).toEqual({ status: "exists" });
    expect(await ws.renameNote({ id: "nope", path: "C", actor: me })).toEqual({ status: "not_found" });
  });
});

describe("trash", () => {
  it("hides a trashed note from reads, search, recents and backlinks, and restores it", async () => {
    const ws = workspace();
    const target = (await save(ws, "Target", "unique-word-zebra")).note;
    const source = (await save(ws, "Source", "[[Target]]")).note;
    await ws.trashNote({ id: target.id, actor: me });

    expect(await ws.getNote({ id: target.id })).toBeNull();
    expect(await ws.search("zebra")).toEqual([]);
    expect((await ws.listRecent(10)).map((n) => n.path)).toEqual(["Source"]);
    expect((await ws.outgoing(source.id))[0]?.id).toBeNull();
    expect((await ws.listTrash()).map((n) => n.path)).toEqual(["Target"]);

    await ws.restoreNote({ id: target.id, actor: me });
    expect(await ws.getNote({ id: target.id })).toMatchObject({ body: "unique-word-zebra" });
    expect((await ws.search("zebra")).map((hit) => hit.id)).toEqual([target.id]);
    expect(await ws.backlinks(target.id)).toMatchObject([{ id: source.id }]);
  });

  it("lets a new note take a trashed note's path, and restores the old one beside it", async () => {
    const ws = workspace();
    const old = (await save(ws, "Note", "old")).note;
    await ws.trashNote({ id: old.id, actor: me });
    expect((await save(ws, "Note", "new")).status).toBe("created");
    const restored = await ws.restoreNote({ id: old.id, actor: me });
    expect(restored?.path).toBe("Note (restored)");
    expect(await ws.restoreNote({ id: old.id, actor: me })).toBeNull();
    expect(await ws.trashNote({ id: "nope", actor: me })).toBe(false);
  });
});

describe("search", () => {
  it("ranks a title match above a body match", async () => {
    const ws = workspace();
    await save(ws, "Journal", "talked about graphs today");
    await save(ws, "Graphs", "notes on layout");
    expect((await ws.search("graphs")).map((hit) => hit.path)).toEqual(["Graphs", "Journal"]);
  });

  it("matches a prefix of the last word and returns a snippet", async () => {
    const ws = workspace();
    await save(ws, "A", "The durable object stores everything");
    const hits = await ws.search("durable obj");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.snippet).toContain("durable");
  });

  it("treats search operators and quotes in the query as plain text", async () => {
    const ws = workspace();
    await save(ws, "A", "plain text");
    expect(await ws.search('"plain" + (text)* ^ :')).toHaveLength(1);
    expect(await ws.search('""')).toEqual([]);
  });

  it("follows edits: old words stop matching", async () => {
    const ws = workspace();
    await save(ws, "A", "apricot");
    await save(ws, "A", "banana");
    expect(await ws.search("apricot")).toEqual([]);
    expect(await ws.search("banana")).toHaveLength(1);
  });

  it("suggests titles by substring", async () => {
    const ws = workspace();
    await save(ws, "Projects/Engineering Principles");
    await save(ws, "Founder Profile");
    expect((await ws.suggestTitles("ncipl")).map((n) => n.path)).toEqual(["Projects/Engineering Principles"]);
    expect((await ws.suggestTitles("fo")).map((n) => n.path)).toEqual(["Founder Profile"]);
  });
});

describe("tags, changes and stats", () => {
  it("indexes tags and lists notes by tag", async () => {
    const ws = workspace();
    await save(ws, "A", "#idea #project/x");
    await save(ws, "B", "#idea");
    expect(await ws.listTags()).toEqual([
      { tag: "idea", count: 2 },
      { tag: "project/x", count: 1 },
    ]);
    expect((await ws.notesByTag("idea")).map((n) => n.path)).toEqual(["A", "B"]);
  });

  it("returns changes after a cursor, in order", async () => {
    const ws = workspace();
    const a = (await save(ws, "A")).note;
    const cursor = (await ws.stats()).seq;
    await save(ws, "A", "edit");
    await ws.trashNote({ id: a.id, actor: me });
    const changes = await ws.changesSince(cursor);
    expect(changes.map((c) => [c.kind, c.noteId])).toEqual([["upsert", a.id], ["trash", a.id]]);
    expect(changes[0]!.seq).toBeGreaterThan(cursor);
  });

  it("counts notes, links and unresolved links", async () => {
    const ws = workspace();
    await save(ws, "A", "[[B]] [[Missing]]");
    await save(ws, "B");
    expect(await ws.stats()).toMatchObject({ notes: 2, links: 2, unresolved: 1, tags: 0 });
  });

  it("keeps two workspaces completely separate", async () => {
    const one = workspace();
    const two = workspace();
    await save(one, "Secret", "only in one");
    expect(await two.getNote({ path: "Secret" })).toBeNull();
    expect(await two.search("only")).toEqual([]);
    expect((await two.stats()).notes).toBe(0);
  });
});

describe("skills", () => {
  const app: Actor = { kind: "app", id: "user-1", app: "Test App" };

  it("refuses an app that tries to create or change a note in the Skills folder, in any letter case", async () => {
    const ws = workspace();
    expect(await ws.saveNote({ path: "Skills/Planted", body: "Do this", actor: app })).toEqual({ status: "protected" });
    expect(await ws.saveNote({ path: "skills/Writing/Planted", body: "Do this", actor: app })).toEqual({ status: "protected" });
    await save(ws, "Skills/Mine", "Mine");
    expect(await ws.saveNote({ path: "Skills/Mine", body: "Changed", expectedRev: 1, actor: app })).toEqual({ status: "protected" });
    expect(await ws.getNote({ path: "Skills/Mine" })).toMatchObject({ body: "Mine", rev: 1 });
    expect(await ws.getNote({ path: "Skills/Planted" })).toBeNull();
  });

  it("refuses an app that tries to move a note into or out of the Skills folder", async () => {
    const ws = workspace();
    const { note: plain } = await save(ws, "Notes/Plain", "x");
    const { note: skill } = await save(ws, "Skills/Mine", "x");
    expect(await ws.renameNote({ id: plain.id, path: "Skills/Plain", actor: app })).toEqual({ status: "protected" });
    expect(await ws.renameNote({ id: skill.id, path: "Notes/Mine", actor: app })).toEqual({ status: "protected" });
  });

  it("lets the user write skills, and lists them sorted by path without their instructions", async () => {
    const ws = workspace();
    await save(ws, "Skills/Writing/Blog post", "---\nname: Blog post\ndescription: Write a blog post.\n---\nSteps");
    await save(ws, "Skills/Code review", "Review a diff.");
    await save(ws, "Notes/Not a skill", "x");
    expect(await ws.listSkills()).toEqual([
      { path: "Skills/Code review", slug: "code-review", name: "Code review", description: "Review a diff.", bundle: null },
      { path: "Skills/Writing/Blog post", slug: "writing-blog-post", name: "Blog post", description: "Write a blog post.", bundle: "Writing" },
    ]);
  });

  it("returns one skill with its instructions by slug, or null", async () => {
    const ws = workspace();
    await save(ws, "Skills/Writing/Blog post", "---\nname: Blog post\ndescription: Write a blog post.\n---\nSteps");
    expect(await ws.getSkill("writing-blog-post")).toMatchObject({ name: "Blog post", instructions: "Steps", slug: "writing-blog-post" });
    expect(await ws.getSkill("nope")).toBeNull();
  });

  it("leaves trashed skills out", async () => {
    const ws = workspace();
    const { note } = await save(ws, "Skills/Old", "x");
    await ws.trashNote({ id: note.id, actor: me });
    expect(await ws.listSkills()).toEqual([]);
  });
});

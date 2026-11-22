import { DurableObject } from "cloudflare:workers";
import { ulid } from "../lib/ids";
import { rewriteLinks, scanMarkdown } from "../lib/markdown";
import { type NotePath, parsePath } from "../lib/paths";
import { assignSlugs, isSkillPath, parseSkill, SKILLS_FOLDER } from "../lib/skills";
import { sourcesKey } from "../sources/crypto";
import type { Tokens } from "../sources/granolaClient";
import { connectGranola, disconnectGranola, type SourceStatus, sourceStatuses, syncGranola, type SyncResult } from "../sources/granolaSync";
import { DEFAULT_LIMITS, type LimitName, type Limits, type Usage } from "./limits";
import { MIGRATIONS } from "./schema";
import type {
  Actor,
  Change,
  Graph,
  LinkedNote,
  Note,
  NoteMeta,
  OutgoingLink,
  RenameResult,
  Revision,
  SaveInput,
  SaveResult,
  SearchHit,
  SkillDetail,
  SkillSummary,
  Stats,
} from "./types";

type Row = Record<string, SqlStorageValue>;

interface NoteRow extends Row {
  rowid: number;
  id: string;
  path: string;
  folder: string;
  title: string;
  body: string;
  rev: number;
  created_at: number;
  updated_at: number;
}

const META_COLUMNS = "n.id, n.path, n.title, n.rev, n.created_at, n.updated_at";
const MAX_DEPTH = 3;
const MAX_LIMIT = 200;
const MAX_SKILLS = 500;
const RATE_BURST = 60;
const RATE_PER_SECOND = 1;

const toMeta = (row: Row): NoteMeta => ({
  id: row.id as string,
  path: row.path as string,
  title: row.title as string,
  rev: row.rev as number,
  createdAt: row.created_at as number,
  updatedAt: row.updated_at as number,
});

/** The UTC calendar day, for the daily write count. */
const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

const clamp = (value: number, max = MAX_LIMIT) => Math.max(1, Math.min(max, Math.floor(value) || 1));

/**
 * One object per workspace. Its SQLite database holds everything that belongs to that workspace,
 * so no query here can reach another workspace's notes. Every write runs in one transaction.
 *
 * Expected failures (conflict, not found, path taken) come back as result values. A method only
 * throws for invalid input, which callers validate with `parsePath` before calling.
 */
export class Workspace extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID");
    const current = this.schemaVersion();
    for (let version = current; version < MIGRATIONS.length; version++) {
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(MIGRATIONS[version]!);
        this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", String(version + 1));
      });
    }
  }

  /** Erases every note, revision and setting. Only the daily job calls this, for a workspace deleted long enough ago. */
  async erase(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  schemaVersion(): number {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'").toArray()[0];
    return row ? Number(row.value) : 0;
  }

  // Reads

  getNote(by: { id: string } | { path: string }): Note | null {
    const row = "id" in by ? this.liveById(by.id) : this.liveByPath(parsePath(by.path).path);
    return row ? { ...toMeta(row), body: row.body } : null;
  }

  listRecent(limit = 50): NoteMeta[] {
    return this.sql
      .exec(`SELECT ${META_COLUMNS} FROM notes n WHERE n.deleted_at IS NULL ORDER BY n.updated_seq DESC LIMIT ?`, clamp(limit))
      .toArray()
      .map(toMeta);
  }

  /**
   * Deletes trashed notes for good, with their revisions; live notes are never touched. Only the user
   * may do this: a connected app is refused, so MCP can never hard-delete. Returns how many went.
   */
  deleteForever(input: { ids: string[] | "all"; actor: Actor }): number {
    if (input.actor.kind !== "user") return 0;
    return this.ctx.storage.transactionSync(() => {
      const rows =
        input.ids === "all"
          ? this.sql.exec<{ rowid: number; id: string }>("SELECT rowid, id FROM notes WHERE deleted_at IS NOT NULL").toArray()
          : input.ids.flatMap((id) =>
              this.sql.exec<{ rowid: number; id: string }>("SELECT rowid, id FROM notes WHERE id = ? AND deleted_at IS NOT NULL", id).toArray(),
            );
      const now = Date.now();
      for (const row of rows) {
        this.sql.exec("DELETE FROM note_revisions WHERE note = ?", row.rowid);
        this.sql.exec("DELETE FROM notes WHERE rowid = ?", row.rowid);
        this.sql.exec("INSERT INTO audit (actor, action, note_id, at) VALUES (?, ?, ?, ?)", JSON.stringify(input.actor), "delete_forever", row.id, now);
      }
      return rows.length;
    });
  }

  listTrash(limit = MAX_LIMIT): NoteMeta[] {
    return this.sql
      .exec(`SELECT ${META_COLUMNS} FROM notes n WHERE n.deleted_at IS NOT NULL ORDER BY n.deleted_at DESC LIMIT ?`, clamp(limit))
      .toArray()
      .map(toMeta);
  }

  listRevisions(id: string): Revision[] {
    return this.sql
      .exec<{ rev: number; body: string; actor: string; at: number }>(
        `SELECT r.rev, r.body, r.actor, r.at FROM note_revisions r
         JOIN notes n ON n.rowid = r.note WHERE n.id = ? ORDER BY r.rev DESC`,
        id,
      )
      .toArray()
      .map((row) => ({ rev: row.rev, body: row.body, actor: JSON.parse(row.actor) as Actor, at: row.at }));
  }

  /** Notes that link to this one. */
  backlinks(id: string): NoteMeta[] {
    return this.sql
      .exec(
        `SELECT ${META_COLUMNS} FROM links l
         JOIN notes t ON t.rowid = l.dst
         JOIN notes n ON n.rowid = l.src
         WHERE t.id = ? AND n.deleted_at IS NULL ORDER BY n.path`,
        id,
      )
      .toArray()
      .map(toMeta);
  }

  /** Links written in this note, in the order they appear in its body. */
  outgoing(id: string): OutgoingLink[] {
    const note = this.liveById(id);
    if (!note) return [];
    const order = new Map(scanMarkdown(note.body).links.map((link, index) => [link.ref.toLowerCase(), index]));
    const position = (ref: string) => order.get(ref.toLowerCase()) ?? order.size;
    return this.sql
      .exec<{ ref: string; embed: number; id: string | null; path: string | null }>(
        `SELECT l.dst_ref AS ref, l.embed, t.id, t.path FROM links l
         LEFT JOIN notes t ON t.rowid = l.dst WHERE l.src = ?`,
        note.rowid,
      )
      .toArray()
      .map((row) => ({ ref: row.ref, embed: row.embed === 1, id: row.id, path: row.path }))
      .sort((a, b) => position(a.ref) - position(b.ref));
  }

  /** Breadth-first walk over links in both directions, up to `depth` hops. Nearest notes first. */
  linked(id: string, depth = 1, limit = 50): LinkedNote[] {
    const start = this.liveById(id);
    if (!start) return [];
    return this.sql
      .exec(
        `WITH RECURSIVE walk (node, depth) AS (
           SELECT ?1, 0
           UNION
           SELECT CASE WHEN l.src = w.node THEN l.dst ELSE l.src END, w.depth + 1
           FROM walk w JOIN links l ON (l.src = w.node OR l.dst = w.node)
           WHERE w.depth < ?2 AND l.dst IS NOT NULL
         )
         SELECT ${META_COLUMNS}, MIN(w.depth) AS depth FROM walk w
         JOIN notes n ON n.rowid = w.node
         WHERE n.rowid != ?1 AND n.deleted_at IS NULL
         GROUP BY n.rowid ORDER BY depth, n.path LIMIT ?3`,
        start.rowid,
        clamp(depth, MAX_DEPTH),
        clamp(limit),
      )
      .toArray()
      .map((row) => ({ ...toMeta(row), depth: row.depth as number }));
  }

  /** Full-text search ranked by BM25, with the title weighted above the body. */
  search(query: string, limit = 20): SearchHit[] {
    const words = query.match(/[\p{L}\p{N}_]+/gu);
    if (!words) return [];
    // Each word is quoted so search operators in the query are plain text; the last word matches as a prefix.
    const match = `${words.map((word) => `"${word}"`).join(" ")}*`;
    return this.sql
      .exec<{ id: string; path: string; title: string; snippet: string }>(
        `SELECT n.id, n.path, n.title, snippet(notes_fts, 1, '', '', '…', 16) AS snippet
         FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
         WHERE notes_fts MATCH ? ORDER BY bm25(notes_fts, 5.0, 1.0), n.path LIMIT ?`,
        match,
        clamp(limit),
      )
      .toArray();
  }

  /** Title and path suggestions for link autocomplete and quick open. */
  suggestTitles(query: string, limit = 10): NoteMeta[] {
    const text = query.trim();
    if (!text) return [];
    // The trigram index needs three characters; shorter queries fall back to a title prefix.
    const rows =
      [...text].length >= 3
        ? this.sql.exec(
            `SELECT ${META_COLUMNS} FROM paths_fts JOIN notes n ON n.rowid = paths_fts.rowid
             WHERE paths_fts MATCH ? ORDER BY length(n.path), n.path LIMIT ?`,
            `"${text.replaceAll('"', '""')}"`,
            clamp(limit),
          )
        : this.sql.exec(
            `SELECT ${META_COLUMNS} FROM notes n
             WHERE n.deleted_at IS NULL AND n.title >= ?1 AND n.title < ?1 || char(1114111)
             ORDER BY n.title LIMIT ?2`,
            text,
            clamp(limit),
          );
    return rows.toArray().map(toMeta);
  }

  /** The skill library: live notes under Skills/, sorted by path, without their instructions. */
  listSkills(): SkillSummary[] {
    return this.skills().map(({ instructions: _, ...summary }) => summary);
  }

  /** One skill with its instructions, by slug, or else by name in any letter case. */
  getSkill(nameOrSlug: string): SkillDetail | null {
    const skills = this.skills();
    const name = nameOrSlug.trim().toLowerCase();
    return skills.find((skill) => skill.slug === name) ?? skills.find((skill) => skill.name.toLowerCase() === name) ?? null;
  }

  private skills(): SkillDetail[] {
    const rows = this.sql
      .exec<{ path: string; body: string }>(
        "SELECT path, body FROM notes WHERE deleted_at IS NULL AND (folder = ? OR folder LIKE ?) ORDER BY path COLLATE NOCASE LIMIT ?",
        SKILLS_FOLDER,
        `${SKILLS_FOLDER}/%`,
        MAX_SKILLS,
      )
      .toArray();
    return assignSlugs(rows.map((row) => parseSkill(row.path, row.body)));
  }

  listTags(): { tag: string; count: number }[] {
    return this.sql
      .exec<{ tag: string; count: number }>("SELECT tag, COUNT(*) AS count FROM tags GROUP BY tag ORDER BY tag")
      .toArray();
  }

  notesByTag(tag: string, limit = MAX_LIMIT): NoteMeta[] {
    return this.sql
      .exec(
        `SELECT ${META_COLUMNS} FROM tags t JOIN notes n ON n.rowid = t.note WHERE t.tag = ? ORDER BY n.path LIMIT ?`,
        tag.toLowerCase(),
        clamp(limit),
      )
      .toArray()
      .map(toMeta);
  }

  /** Changes after a cursor, oldest first. Clients keep the last `seq` they saw. */
  changesSince(seq: number, limit = MAX_LIMIT): Change[] {
    return this.sql
      .exec<{ seq: number; kind: Change["kind"]; note_id: string; at: number }>(
        "SELECT seq, kind, note_id, at FROM changes WHERE seq > ? ORDER BY seq LIMIT ?",
        seq,
        clamp(limit, 1000),
      )
      .toArray()
      .map((row) => ({ seq: row.seq, kind: row.kind, noteId: row.note_id, at: row.at }));
  }

  stats(): Stats {
    return this.sql
      .exec<Stats & Row>(
        `SELECT
           (SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL) AS notes,
           (SELECT COUNT(*) FROM links) AS links,
           (SELECT COUNT(*) FROM links WHERE dst IS NULL) AS unresolved,
           (SELECT COUNT(DISTINCT tag) FROM tags) AS tags,
           (SELECT COALESCE(MAX(seq), 0) FROM changes) AS seq`,
      )
      .one();
  }

  // Graph

  /** All live notes and resolved links between them, with saved positions where known. */
  graph(): Graph {
    const notes = this.sql
      .exec<{ rowid: number; id: string; path: string }>("SELECT rowid, id, path FROM notes WHERE deleted_at IS NULL ORDER BY rowid")
      .toArray();
    const index = new Map(notes.map((note, i) => [note.rowid, i]));
    const edges: number[] = [];
    for (const link of this.sql.exec<{ src: number; dst: number }>("SELECT src, dst FROM links WHERE dst IS NOT NULL ORDER BY src, dst")) {
      const a = index.get(link.src);
      const b = index.get(link.dst);
      if (a !== undefined && b !== undefined && a !== b) edges.push(a, b);
    }
    const saved = this.sql
      .exec<{ note_ids: string; positions: ArrayBuffer; saved_at: number }>("SELECT note_ids, positions, saved_at FROM layout WHERE id = 1")
      .toArray()[0];
    const positions: (number | null)[] = new Array(notes.length * 2).fill(null);
    if (saved) {
      const ids: string[] = JSON.parse(saved.note_ids);
      const xy = new Float32Array(saved.positions);
      const at = new Map(ids.map((id, i) => [id, i]));
      notes.forEach((note, i) => {
        const j = at.get(note.id);
        if (j !== undefined) {
          positions[2 * i] = xy[2 * j]!;
          positions[2 * i + 1] = xy[2 * j + 1]!;
        }
      });
    }
    return {
      seq: this.stats().seq,
      layoutAt: saved?.saved_at ?? 0,
      ids: notes.map((note) => note.id),
      paths: notes.map((note) => note.path),
      edges,
      positions,
    };
  }

  /** Stores node positions as one packed row, so saving a layout is a single row write. */
  saveLayout(ids: string[], positions: number[]): number {
    if (positions.length !== ids.length * 2 || !positions.every(Number.isFinite)) throw new Error("Invalid layout");
    const at = Date.now();
    this.sql.exec(
      "INSERT OR REPLACE INTO layout (id, note_ids, positions, saved_at) VALUES (1, ?, ?, ?)",
      JSON.stringify(ids),
      new Float32Array(positions).buffer,
      at,
    );
    return at;
  }

  // Rate limit and read audit

  /** Token buckets per connected app: in memory, so they reset if the object restarts. */
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  /**
   * Called before each MCP tool call. Applies a per-app rate limit (bursts of 60, then 1 per
   * second) and, for reads, writes an audit row. Returns false when the call should be refused.
   */
  checkIn(actor: Actor, tool: string, isRead: boolean): boolean {
    const key = `${actor.id}:${actor.app ?? ""}`;
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: RATE_BURST, at: now };
    bucket.tokens = Math.min(RATE_BURST, bucket.tokens + ((now - bucket.at) / 1000) * RATE_PER_SECOND);
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    if (isRead) {
      this.sql.exec("INSERT INTO audit (actor, action, note_id, at) VALUES (?, ?, NULL, ?)", JSON.stringify(actor), `read:${tool}`, now);
    }
    return true;
  }

  /** Recent audit entries, newest first. */
  listAudit(limit = 100): { actor: Actor; action: string; noteId: string | null; at: number }[] {
    return this.sql
      .exec<{ actor: string; action: string; note_id: string | null; at: number }>(
        "SELECT actor, action, note_id, at FROM audit ORDER BY seq DESC LIMIT ?",
        clamp(limit, 500),
      )
      .toArray()
      .map((row) => ({ actor: JSON.parse(row.actor) as Actor, action: row.action, noteId: row.note_id, at: row.at }));
  }

  // Sources: apps that send notes in (Granola). Tokens are sealed and never leave this object.

  private granolaSync: Promise<SyncResult> | null = null;

  private async sourceDeps() {
    const key = await sourcesKey(this.env);
    if (!key) throw new Error("SOURCES_KEY is not set");
    return {
      sql: this.sql,
      key,
      getNote: (id: string) => this.getNote({ id }),
      saveNote: (input: SaveInput) => this.saveNote(input),
    };
  }

  sourceStatus(): SourceStatus[] {
    return sourceStatuses(this.sql);
  }

  async connectGranola(input: { userId: string; clientId: string; tokens: Tokens }): Promise<void> {
    await connectGranola(await this.sourceDeps(), input);
  }

  async disconnectGranola(): Promise<boolean> {
    return disconnectGranola(await this.sourceDeps());
  }

  /** One sync at a time: a second caller waits for the running one. */
  async syncGranola(): Promise<SyncResult> {
    this.granolaSync ??= this.sourceDeps()
      .then(syncGranola)
      .finally(() => (this.granolaSync = null));
    return this.granolaSync;
  }

  // Limits

  /** Raises or lowers this workspace's limits; anything not given keeps its current value. */
  setLimits(next: Partial<Limits>): Limits {
    const keys: [keyof Limits, string][] = [["notes", "limit_notes"], ["bytes", "limit_bytes"], ["writesPerDay", "limit_writes"]];
    for (const [name, key] of keys) {
      const value = next[name];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number, 0 or more`);
      this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, String(value));
    }
    return this.limits();
  }

  /** What this workspace uses, next to what it may use. */
  usage(now = Date.now()): Usage {
    return { notes: this.noteCount(), bytes: this.sql.databaseSize, writesToday: this.writesToday(now), limits: this.limits() };
  }

  private limits(): Limits {
    const read = (key: string, fallback: number) => {
      const row = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
      return row ? Number(row.value) : fallback;
    };
    return {
      notes: read("limit_notes", DEFAULT_LIMITS.notes),
      bytes: read("limit_bytes", DEFAULT_LIMITS.bytes),
      writesPerDay: read("limit_writes", DEFAULT_LIMITS.writesPerDay),
    };
  }

  private noteCount(): number {
    return this.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM notes").one().count;
  }

  private writesToday(now: number): number {
    const rows = this.sql.exec<{ key: string; value: string }>("SELECT key, value FROM meta WHERE key IN ('writes_day', 'writes_count')").toArray();
    const day = rows.find((row) => row.key === "writes_day")?.value;
    return day === utcDay(now) ? Number(rows.find((row) => row.key === "writes_count")?.value ?? 0) : 0;
  }

  /** The limit a save would break, if any. Only saves that change something are checked. */
  private overLimit(creating: boolean, now: number): LimitName | null {
    const limits = this.limits();
    if (this.writesToday(now) >= limits.writesPerDay) return "writes";
    if (creating && this.noteCount() >= limits.notes) return "notes";
    if (this.sql.databaseSize >= limits.bytes) return "storage";
    return null;
  }

  private countWrite(now: number): void {
    const count = this.writesToday(now) + 1;
    this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('writes_day', ?), ('writes_count', ?)", utcDay(now), String(count));
  }

  // Writes

  saveNote(input: SaveInput): SaveResult {
    const target = parsePath(input.path);
    if (input.actor.kind === "app" && isSkillPath(target.path)) return { status: "protected" };
    return this.ctx.storage.transactionSync(() => {
      const existing = this.liveByPath(target.path);
      const now = Date.now();

      if (!existing) {
        if (input.expectedRev !== undefined && input.expectedRev !== 0) return { status: "not_found" };
        const limit = this.overLimit(true, now);
        if (limit) return { status: "limit", limit };
        this.countWrite(now);
        const id = ulid(now);
        const seq = this.recordChange("upsert", id, now, input.actor, "create");
        const rowid = this.sql
          .exec<{ rowid: number }>(
            `INSERT INTO notes (id, path, folder, title, body, rev, created_at, updated_at, updated_seq)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?) RETURNING rowid`,
            id,
            target.path,
            target.folder,
            target.title,
            input.body,
            now,
            now,
            seq,
          )
          .one().rowid;
        this.sql.exec("INSERT INTO notes_fts (rowid, title, body) VALUES (?, ?, ?)", rowid, target.title, input.body);
        this.sql.exec("INSERT INTO paths_fts (rowid, path) VALUES (?, ?)", rowid, target.path);
        this.indexBody(rowid, target.folder, input.body);
        this.resolvePending(rowid, target);
        return { status: "created", note: toMeta(this.liveById(id)!) };
      }

      if (input.expectedRev !== undefined && input.expectedRev !== existing.rev) {
        return { status: "conflict", note: toMeta(existing) };
      }
      if (existing.body === input.body) return { status: "unchanged", note: toMeta(existing) };
      const limit = this.overLimit(false, now);
      if (limit) return { status: "limit", limit };
      this.countWrite(now);

      const seq = this.recordChange("upsert", existing.id, now, input.actor, "update");
      this.writeBody(existing, input.body, input.actor, now);
      this.sql.exec("UPDATE notes SET updated_at = ?, updated_seq = ? WHERE rowid = ?", now, seq, existing.rowid);
      return { status: "updated", note: toMeta(this.liveById(existing.id)!) };
    });
  }

  /** Moves a note. Links to it in other notes are rewritten in the same transaction. */
  renameNote(input: { id: string; path: string; actor: Actor }): RenameResult {
    const target = parsePath(input.path);
    return this.ctx.storage.transactionSync(() => {
      const note = this.liveById(input.id);
      if (!note) return { status: "not_found" };
      if (input.actor.kind === "app" && (isSkillPath(note.path) || isSkillPath(target.path))) return { status: "protected" };
      const taken = this.liveByPath(target.path);
      if (taken && taken.rowid !== note.rowid) return { status: "exists" };
      if (taken && note.path === target.path) return { status: "renamed", note: toMeta(note) };

      const now = Date.now();
      const limit = this.overLimit(false, now);
      if (limit) return { status: "limit", limit };
      this.countWrite(now);
      const sources = this.sql
        .exec<{ src: number; dst_ref: string }>("SELECT src, dst_ref FROM links WHERE dst = ?", note.rowid)
        .toArray();

      const seq = this.recordChange("rename", note.id, now, input.actor, "rename");
      this.sql.exec(
        "UPDATE notes SET path = ?, folder = ?, title = ?, updated_at = ?, updated_seq = ? WHERE rowid = ?",
        target.path,
        target.folder,
        target.title,
        now,
        seq,
        note.rowid,
      );
      this.sql.exec("UPDATE notes_fts SET title = ? WHERE rowid = ?", target.title, note.rowid);
      this.sql.exec("UPDATE paths_fts SET path = ? WHERE rowid = ?", target.path, note.rowid);

      // A bare title stays a bare title unless another note shares it; then the full path is needed.
      const titleIsUnique =
        this.sql
          .exec<{ count: number }>("SELECT COUNT(*) AS count FROM notes WHERE title = ? AND deleted_at IS NULL", target.title)
          .one().count === 1;
      const bySource = Map.groupBy(sources, (link) => link.src);
      for (const [src, links] of bySource) {
        const source = this.liveByRowid(src);
        if (!source) continue;
        const old = new Set(links.map((link) => link.dst_ref.toLowerCase()));
        const body = rewriteLinks(source.body, (ref) => {
          if (!old.has(ref.toLowerCase())) return null;
          return ref.includes("/") || !titleIsUnique ? target.path : target.title;
        });
        if (body === source.body) continue;
        this.recordChange("upsert", source.id, now, input.actor, "relink");
        this.writeBody(source, body, input.actor, now);
      }

      this.resolvePending(note.rowid, target);
      return { status: "renamed", note: toMeta(this.liveById(note.id)!) };
    });
  }

  /** Soft delete. The note leaves search, links and lists, and can be restored. False if there is no such note. */
  trashNote(input: { id: string; actor: Actor }): boolean {
    return this.ctx.storage.transactionSync(() => {
      const note = this.liveById(input.id);
      if (!note) return false;
      const now = Date.now();
      this.recordChange("trash", note.id, now, input.actor, "trash");
      this.sql.exec("UPDATE notes SET deleted_at = ? WHERE rowid = ?", now, note.rowid);
      this.sql.exec("DELETE FROM notes_fts WHERE rowid = ?", note.rowid);
      this.sql.exec("DELETE FROM paths_fts WHERE rowid = ?", note.rowid);
      this.sql.exec("DELETE FROM links WHERE src = ?", note.rowid);
      this.sql.exec("DELETE FROM tags WHERE note = ?", note.rowid);
      this.sql.exec("UPDATE links SET dst = NULL WHERE dst = ?", note.rowid);
      return true;
    });
  }

  /** Brings a trashed note back. If its path was taken meanwhile, it returns beside the new note. */
  restoreNote(input: { id: string; actor: Actor }): NoteMeta | null {
    return this.ctx.storage.transactionSync(() => {
      const note = this.sql
        .exec<NoteRow>("SELECT * FROM notes WHERE id = ? AND deleted_at IS NOT NULL", input.id)
        .toArray()[0];
      if (!note) return null;

      let target = parsePath(note.path);
      for (let n = 1; this.liveByPath(target.path); n++) {
        target = parsePath(`${note.path} (restored${n > 1 ? ` ${n}` : ""})`);
      }
      const now = Date.now();
      const seq = this.recordChange("restore", note.id, now, input.actor, "restore");
      this.sql.exec(
        "UPDATE notes SET deleted_at = NULL, path = ?, folder = ?, title = ?, updated_seq = ? WHERE rowid = ?",
        target.path,
        target.folder,
        target.title,
        seq,
        note.rowid,
      );
      this.sql.exec("INSERT INTO notes_fts (rowid, title, body) VALUES (?, ?, ?)", note.rowid, target.title, note.body);
      this.sql.exec("INSERT INTO paths_fts (rowid, path) VALUES (?, ?)", note.rowid, target.path);
      this.indexBody(note.rowid, target.folder, note.body);
      this.resolvePending(note.rowid, target);
      return toMeta(this.liveById(note.id)!);
    });
  }

  // Internals

  private liveById(id: string): NoteRow | undefined {
    return this.sql.exec<NoteRow>("SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL", id).toArray()[0];
  }

  private liveByRowid(rowid: number): NoteRow | undefined {
    return this.sql.exec<NoteRow>("SELECT * FROM notes WHERE rowid = ? AND deleted_at IS NULL", rowid).toArray()[0];
  }

  private liveByPath(path: string): NoteRow | undefined {
    return this.sql.exec<NoteRow>("SELECT * FROM notes WHERE path = ? AND deleted_at IS NULL", path).toArray()[0];
  }

  private recordChange(kind: Change["kind"], noteId: string, at: number, actor: Actor, action: string): number {
    this.sql.exec("INSERT INTO audit (actor, action, note_id, at) VALUES (?, ?, ?, ?)", JSON.stringify(actor), action, noteId, at);
    return this.sql
      .exec<{ seq: number }>("INSERT INTO changes (kind, note_id, at) VALUES (?, ?, ?) RETURNING seq", kind, noteId, at)
      .one().seq;
  }

  /** Replaces a note's body: keeps the old one as a revision, then updates search and links. */
  private writeBody(note: NoteRow, body: string, actor: Actor, at: number): void {
    this.sql.exec(
      "INSERT INTO note_revisions (note, rev, body, actor, at) VALUES (?, ?, ?, ?, ?)",
      note.rowid,
      note.rev,
      note.body,
      JSON.stringify(actor),
      at,
    );
    this.sql.exec("UPDATE notes SET body = ?, rev = rev + 1 WHERE rowid = ?", body, note.rowid);
    this.sql.exec("UPDATE notes_fts SET body = ? WHERE rowid = ?", body, note.rowid);
    this.indexBody(note.rowid, note.folder, body);
  }

  /** Brings the link and tag rows for a note in line with its body, writing only the differences. */
  private indexBody(rowid: number, folder: string, body: string): void {
    const scanned = scanMarkdown(body);
    this.sql.exec("UPDATE notes SET frontmatter = ? WHERE rowid = ? AND frontmatter IS NOT ?", scanned.frontmatter, rowid, scanned.frontmatter);

    const wanted = new Map(scanned.links.map((link) => [link.ref.toLowerCase(), link]));
    const existing = this.sql
      .exec<{ dst_ref: string; embed: number }>("SELECT dst_ref, embed FROM links WHERE src = ?", rowid)
      .toArray();
    for (const row of existing) {
      const link = wanted.get(row.dst_ref.toLowerCase());
      if (!link) {
        this.sql.exec("DELETE FROM links WHERE src = ? AND dst_ref = ?", rowid, row.dst_ref);
      } else {
        if ((row.embed === 1) !== link.embed) {
          this.sql.exec("UPDATE links SET embed = ? WHERE src = ? AND dst_ref = ?", link.embed ? 1 : 0, rowid, row.dst_ref);
        }
        wanted.delete(row.dst_ref.toLowerCase());
      }
    }
    for (const link of wanted.values()) {
      this.sql.exec(
        "INSERT INTO links (src, dst_ref, dst, embed) VALUES (?, ?, ?, ?)",
        rowid,
        link.ref,
        this.resolveRef(link.ref, folder),
        link.embed ? 1 : 0,
      );
    }

    const tags = new Set(scanned.tags);
    for (const row of this.sql.exec<{ tag: string }>("SELECT tag FROM tags WHERE note = ?", rowid).toArray()) {
      if (!tags.delete(row.tag)) this.sql.exec("DELETE FROM tags WHERE note = ? AND tag = ?", rowid, row.tag);
    }
    for (const tag of tags) this.sql.exec("INSERT INTO tags (note, tag) VALUES (?, ?)", rowid, tag);
  }

  /**
   * Finds the note a link points to, the way Obsidian does: an exact path first, then a note whose
   * title (and trailing folders, if written) match, preferring the linking note's own folder, then
   * the shortest path.
   */
  private resolveRef(ref: string, fromFolder: string): number | null {
    let wanted: NotePath;
    try {
      wanted = parsePath(ref);
    } catch {
      return null;
    }
    const exact = this.liveByPath(wanted.path);
    if (exact) return exact.rowid;

    const suffix = `/${wanted.path.toLowerCase()}`;
    const candidates = this.sql
      .exec<{ rowid: number; path: string; folder: string }>(
        "SELECT rowid, path, folder FROM notes WHERE title = ? AND deleted_at IS NULL",
        wanted.title,
      )
      .toArray()
      .filter((note) => !wanted.folder || note.path.toLowerCase().endsWith(suffix));
    const here = fromFolder.toLowerCase();
    candidates.sort(
      (a, b) =>
        Number(b.folder.toLowerCase() === here) - Number(a.folder.toLowerCase() === here) ||
        a.path.length - b.path.length ||
        a.path.localeCompare(b.path),
    );
    return candidates[0]?.rowid ?? null;
  }

  /** After a note appears at a path, points waiting links at it. */
  private resolvePending(rowid: number, target: NotePath): void {
    const title = target.title.toLowerCase();
    const waiting = this.sql
      .exec<{ src: number; dst_ref: string; folder: string }>(
        `SELECT l.src, l.dst_ref, n.folder FROM links l JOIN notes n ON n.rowid = l.src
         WHERE l.dst IS NULL AND (l.dst_ref = ?1 OR substr(lower(l.dst_ref), -length(?2)) = ?2)`,
        target.title,
        `/${title}`,
      )
      .toArray();
    for (const link of waiting) {
      if (this.resolveRef(link.dst_ref, link.folder) === rowid) {
        this.sql.exec("UPDATE links SET dst = ? WHERE src = ? AND dst_ref = ?", rowid, link.src, link.dst_ref);
      }
    }
  }
}

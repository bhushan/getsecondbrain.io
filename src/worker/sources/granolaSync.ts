import type { Actor, Note, SaveInput, SaveResult } from "../workspace/types";
import { seal, unseal } from "./crypto";
import { GranolaAuthError, GranolaMcp, refreshTokens, revokeToken, type Tokens } from "./granolaClient";
import { isGranolaNote, MEETINGS_HUB_BODY, MEETINGS_HUB_PATH, meetingPath, parseMeetings, parseSearchPage, renderMeeting, type Meeting } from "./granolaFormat";

/**
 * Granola sync, run inside the workspace object so one writer owns the rotating refresh token.
 * Tables `sources` and `source_items` are in the workspace schema.
 */

const PROVIDER = "granola";
/** The first sync asks for everything Granola lets us see (30 days on its free plan). */
const FIRST_SYNC_FROM = "2000-01-01T00:00:00.000Z";
const PAGE_SIZE = 50;
const MAX_PAGES = 50;
const BATCH = 10;
const REFRESH_MARGIN_MS = 2 * 60 * 1000;
const MAX_TITLE_COPIES = 20;
/** Revision recorded for an adopted note: never a real one, so sync never rewrites it. */
const ADOPTED_REV = -1;

const isTracked = (sql: SqlStorage, noteId: string) =>
  sql.exec("SELECT 1 FROM source_items WHERE provider = ? AND note_id = ? LIMIT 1", PROVIDER, noteId).toArray().length > 0;

export interface SourceStatus {
  provider: string;
  status: "active" | "reconnect";
  account: string | null;
  connectedAt: number;
  /** When the last sync finished without an error. */
  lastSyncAt: number | null;
  /** The last sync's error, cleared by the next good sync. */
  lastError: string | null;
  /** Notes this source has written. */
  notes: number;
}

export type SyncResult =
  /** `adopted`: notes already written from Granola (by the Obsidian plugin), linked and left as they are. */
  | { status: "ok"; created: number; updated: number; unchanged: number; skipped: number; adopted: number }
  | { status: "reconnect" }
  | { status: "error"; error: string }
  | { status: "not_connected" };

interface SourceRow extends Record<string, SqlStorageValue> {
  provider: string;
  client_id: string;
  tokens: string;
  status: string;
  account: string | null;
  user_id: string;
  synced_until: string | null;
  last_sync_at: number | null;
  last_error: string | null;
  created_at: number;
}

export interface SyncDeps {
  sql: SqlStorage;
  key: CryptoKey;
  getNote(id: string): Note | null;
  saveNote(input: SaveInput): SaveResult;
  now?: number;
}

/** Sealed values are bound to the provider and the user who connected it. */
const ownerOf = (row: Pick<SourceRow, "provider" | "user_id">) => `${row.provider}:${row.user_id}`;

const load = (sql: SqlStorage) => sql.exec<SourceRow>("SELECT * FROM sources WHERE provider = ?", PROVIDER).toArray()[0];

export function sourceStatuses(sql: SqlStorage): SourceStatus[] {
  return sql
    .exec<SourceRow & { notes: number }>(
      "SELECT s.*, (SELECT COUNT(*) FROM source_items i WHERE i.provider = s.provider) AS notes FROM sources s ORDER BY s.provider",
    )
    .toArray()
    .map((row) => ({
      provider: row.provider,
      status: row.status === "active" ? "active" : "reconnect",
      account: row.account,
      connectedAt: row.created_at,
      lastSyncAt: row.last_sync_at,
      lastError: row.last_error,
      notes: row.notes,
    }));
}

/** Stores a fresh Granola connection, replacing any earlier one. Notes already synced stay linked. */
export async function connectGranola(deps: Pick<SyncDeps, "sql" | "key">, input: { userId: string; clientId: string; tokens: Tokens }): Promise<void> {
  const owner = ownerOf({ provider: PROVIDER, user_id: input.userId });
  const sealed = await seal(deps.key, owner, input.tokens);
  const previous = load(deps.sql);
  deps.sql.exec(
    `INSERT INTO sources (provider, client_id, tokens, status, account, user_id, synced_until, last_sync_at, last_error, created_at)
     VALUES (?, ?, ?, 'active', NULL, ?, ?, ?, NULL, ?)
     ON CONFLICT (provider) DO UPDATE SET client_id = excluded.client_id, tokens = excluded.tokens, status = 'active',
       account = NULL, user_id = excluded.user_id, last_error = NULL`,
    PROVIDER,
    input.clientId,
    sealed,
    input.userId,
    previous?.synced_until ?? null,
    previous?.last_sync_at ?? null,
    Date.now(),
  );
}

/** Revokes the token at Granola (best effort) and forgets the connection. The notes stay. */
export async function disconnectGranola(deps: Pick<SyncDeps, "sql" | "key">): Promise<boolean> {
  const row = load(deps.sql);
  if (!row) return false;
  deps.sql.exec("DELETE FROM sources WHERE provider = ?", PROVIDER);
  try {
    const tokens = await unseal<Tokens>(deps.key, ownerOf(row), row.tokens);
    await revokeToken(row.client_id, tokens.refresh);
  } catch {
    // The connection is gone on our side either way; the user can also remove it in Granola.
  }
  return true;
}

export async function syncGranola(deps: SyncDeps): Promise<SyncResult> {
  const now = deps.now ?? Date.now();
  const row = load(deps.sql);
  if (!row) return { status: "not_connected" };
  if (row.status !== "active") return { status: "reconnect" };
  const owner = ownerOf(row);
  const startedAt = new Date(now).toISOString();
  let tokens: Tokens;
  try {
    tokens = await unseal<Tokens>(deps.key, owner, row.tokens);
  } catch {
    // The sealing key changed or the value is damaged: only a fresh sign-in can fix it.
    deps.sql.exec("UPDATE sources SET status = 'reconnect', last_error = ? WHERE provider = ?", "Saved Granola access could not be read. Reconnect Granola.", PROVIDER);
    return { status: "reconnect" };
  }

  try {
    if (tokens.expiresAt - REFRESH_MARGIN_MS <= now) {
      const refreshed = await refreshTokens(row.client_id, tokens.refresh, now);
      if (!refreshed.ok) {
        if (refreshed.revoked) {
          deps.sql.exec("UPDATE sources SET status = 'reconnect', last_error = ? WHERE provider = ?", "Granola access ended. Reconnect Granola.", PROVIDER);
          return { status: "reconnect" };
        }
        throw new Error(refreshed.error);
      }
      tokens = refreshed.tokens;
      // Granola rotates refresh tokens: save the new one before anything else can fail.
      deps.sql.exec("UPDATE sources SET tokens = ? WHERE provider = ?", await seal(deps.key, owner, tokens), PROVIDER);
    }

    const mcp = await GranolaMcp.open(tokens.access);
    const account = row.account ?? (await accountEmail(mcp));

    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const args: Record<string, unknown> = { updated_after: row.synced_until ?? FIRST_SYNC_FROM, limit: PAGE_SIZE };
      if (cursor) args.cursor = cursor;
      const page = parseSearchPage(await mcp.callTool("search_meetings", args));
      ids.push(...page.ids);
      cursor = page.nextCursor;
      if (++pages >= MAX_PAGES && cursor) throw new Error("Granola has more changes than one run can read; the next run continues.");
    } while (cursor);

    const actor: Actor = { kind: "app", id: row.user_id, app: "Granola" };
    const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0, adopted: 0 };
    const unique = [...new Set(ids)];
    // Create the hub once; if it exists (ours or the user's), it is left alone.
    if (unique.length) deps.saveNote({ path: MEETINGS_HUB_PATH, body: MEETINGS_HUB_BODY, expectedRev: 0, actor });
    for (let i = 0; i < unique.length; i += BATCH) {
      const meetings = parseMeetings(await mcp.callTool("get_meetings", { meeting_ids: unique.slice(i, i + BATCH) }));
      for (const meeting of meetings) counts[writeMeeting(deps, actor, meeting)]++;
    }

    // Only a run that wrote everything moves the cursor, so a failure is retried next time.
    deps.sql.exec(
      "UPDATE sources SET synced_until = ?, last_sync_at = ?, last_error = NULL, account = ? WHERE provider = ?",
      startedAt,
      now,
      account,
      PROVIDER,
    );
    return { status: "ok", ...counts };
  } catch (error) {
    if (error instanceof GranolaAuthError) {
      // Refresh on the next run.
      deps.sql.exec("UPDATE sources SET tokens = ? WHERE provider = ?", await seal(deps.key, owner, { ...tokens, expiresAt: 0 }), PROVIDER);
    }
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    deps.sql.exec("UPDATE sources SET last_error = ? WHERE provider = ?", message, PROVIDER);
    return { status: "error", error: message };
  }
}

async function accountEmail(mcp: GranolaMcp): Promise<string | null> {
  try {
    const info = JSON.parse(await mcp.callTool("get_account_info", {})) as { email?: unknown };
    return typeof info.email === "string" ? info.email : null;
  } catch {
    return null;
  }
}

/**
 * Writes one meeting. A meeting seen before updates its own note wherever the user moved it, unless
 * the user edited that note (its revision moved on) or trashed it: then it is left alone.
 */
function writeMeeting(deps: SyncDeps, actor: Actor, meeting: Meeting): "created" | "updated" | "unchanged" | "skipped" | "adopted" {
  const body = renderMeeting(meeting);
  const item = deps.sql
    .exec<{ note_id: string; rev: number }>("SELECT note_id, rev FROM source_items WHERE provider = ? AND external_id = ?", PROVIDER, meeting.id)
    .toArray()[0];

  if (item) {
    const note = deps.getNote(item.note_id);
    if (!note || note.rev !== item.rev) return "skipped";
    const result = deps.saveNote({ path: note.path, body, expectedRev: note.rev, actor });
    if (result.status !== "updated" && result.status !== "unchanged") return "skipped";
    deps.sql.exec("UPDATE source_items SET rev = ? WHERE provider = ? AND external_id = ?", result.note.rev, PROVIDER, meeting.id);
    return result.status;
  }

  const base = meetingPath(meeting);
  for (let copy = 1; copy <= MAX_TITLE_COPIES; copy++) {
    const result = deps.saveNote({ path: copy === 1 ? base : `${base} (${copy})`, body, expectedRev: 0, actor });
    if (result.status === "created") {
      deps.sql.exec(
        "INSERT INTO source_items (provider, external_id, note_id, rev) VALUES (?, ?, ?, ?)",
        PROVIDER,
        meeting.id,
        result.note.id,
        result.note.rev,
      );
      return "created";
    }
    if (result.status !== "conflict") return "skipped";
    // A Granola note already at this path (from the Obsidian plugin) is this meeting: link it, keep it as is.
    if (copy === 1 && isGranolaNote(deps.getNote(result.note.id)?.body ?? "", meeting.id) && !isTracked(deps.sql, result.note.id)) {
      deps.sql.exec("INSERT INTO source_items (provider, external_id, note_id, rev) VALUES (?, ?, ?, ?)", PROVIDER, meeting.id, result.note.id, ADOPTED_REV);
      return "adopted";
    }
  }
  return "skipped";
}

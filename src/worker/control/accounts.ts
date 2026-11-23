import { ulid } from "../lib/ids";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  role: string;
}

const SESSION_DAYS = 30;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** True only when the `SIGNUP` var is exactly "open". Anything else, or nothing, keeps sign-in closed. */
// Typed as a plain string: the generated Env narrows SIGNUP to whatever wrangler.jsonc says today.
export const signupOpen = (env: { SIGNUP?: string }) => env.SIGNUP === "open";

/**
 * Whether this Google account may sign in. With open sign-up, any verified account may; otherwise
 * only the emails in the ALLOWED_EMAILS secret.
 */
export function isAllowed(env: { ALLOWED_EMAILS?: string; SIGNUP?: string }, email: string): boolean {
  if (signupOpen(env)) return true;
  const allowed = (env.ALLOWED_EMAILS ?? "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Finds or creates the user for a Google account, matched by Google's stable account id (`sub`).
 * An email already used by a different Google account returns null: email addresses get recycled,
 * so an email match alone never hands over an account. A new user gets a first workspace.
 */
export async function upsertGoogleUser(db: D1Database, profile: { sub: string; email: string; name: string }): Promise<User | null> {
  const existing = await db.prepare("SELECT id, email, name FROM users WHERE google_sub = ?").bind(profile.sub).first<User>();
  if (existing) {
    const taken = await db.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?").bind(profile.email, existing.id).first();
    const email = taken ? existing.email : profile.email;
    await db
      .prepare("UPDATE users SET email = ?, name = ? WHERE id = ? AND (email IS NOT ? OR name IS NOT ?)")
      .bind(email, profile.name, existing.id, email, profile.name)
      .run();
    return { id: existing.id, email, name: profile.name };
  }
  if (await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(profile.email).first()) return null;
  const now = Date.now();
  const user: User = { id: ulid(now), email: profile.email, name: profile.name };
  const workspaceId = ulid(now);
  await db.batch([
    db.prepare("INSERT INTO users (id, email, name, google_sub, created_at) VALUES (?, ?, ?, ?, ?)").bind(user.id, user.email, user.name, profile.sub, now),
    db.prepare("INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)").bind(workspaceId, "My second brain", user.id, now),
    db.prepare("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(user.id, workspaceId, now),
  ]);
  return user;
}

export async function createWorkspace(db: D1Database, userId: string, name: string): Promise<WorkspaceInfo> {
  const now = Date.now();
  const id = ulid(now);
  await db.batch([
    db.prepare("INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)").bind(id, name, userId, now),
    db.prepare("INSERT INTO memberships (user_id, workspace_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(userId, id, now),
  ]);
  return { id, name, role: "owner" };
}

export async function listWorkspaces(db: D1Database, userId: string): Promise<WorkspaceInfo[]> {
  const { results } = await db
    .prepare(
      `SELECT w.id, w.name, m.role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ? AND w.deleted_at IS NULL ORDER BY m.created_at, w.id`,
    )
    .bind(userId)
    .all<WorkspaceInfo>();
  return results;
}

/** The workspace if this user is a member of it, otherwise null. */
export async function membership(db: D1Database, userId: string, workspaceId: string): Promise<WorkspaceInfo | null> {
  return db
    .prepare(
      `SELECT w.id, w.name, m.role FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ? AND m.workspace_id = ? AND w.deleted_at IS NULL`,
    )
    .bind(userId, workspaceId)
    .first<WorkspaceInfo>();
}

export async function renameWorkspace(db: D1Database, workspaceId: string, name: string): Promise<void> {
  await db.prepare("UPDATE workspaces SET name = ? WHERE id = ? AND deleted_at IS NULL").bind(name, workspaceId).run();
}

/** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
export async function createSession(db: D1Database, userId: string): Promise<{ token: string; maxAge: number }> {
  const token = randomToken();
  const now = Date.now();
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, now, now + maxAge * 1000)
    .run();
  return { token, maxAge };
}

export async function userForSession(db: D1Database, token: string): Promise<User | null> {
  return db
    .prepare(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(await sha256(token), Date.now())
    .first<User>();
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

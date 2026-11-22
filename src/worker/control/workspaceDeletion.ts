import { oauthApi } from "../auth/oauth";

/**
 * Deleting a workspace hides it at once and disconnects its apps. The owner can restore it for
 * RESTORE_DAYS; after that the daily job erases its notes and its records.
 */
export const RESTORE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const RESTORE_MS = RESTORE_DAYS * DAY;

export interface DeletedWorkspace {
  id: string;
  name: string;
  deletedAt: number;
  eraseAt: number;
}

/** Revokes every connection the user made to this workspace. */
async function revokeWorkspaceGrants(env: Env, userId: string, workspaceId: string): Promise<void> {
  const oauth = oauthApi(env);
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(userId, { cursor });
    for (const grant of page.items) if (grant.metadata?.workspaceId === workspaceId) ids.push(grant.id);
    cursor = page.cursor;
  } while (cursor);
  for (const id of ids) await oauth.revokeGrant(id, userId);
}

/** Disconnects the workspace's apps, then hides it. A failure before the last step leaves it listed, so it can be tried again. */
export async function deleteWorkspace(env: Env, userId: string, workspaceId: string, now = Date.now()): Promise<void> {
  await revokeWorkspaceGrants(env, userId, workspaceId);
  await env.DB.prepare("UPDATE workspaces SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL").bind(now, workspaceId).run();
}

/** The user's own workspaces that are deleted but can still be restored. */
export async function listDeletedWorkspaces(db: D1Database, userId: string, now = Date.now()): Promise<DeletedWorkspace[]> {
  const { results } = await db
    .prepare("SELECT id, name, deleted_at AS deletedAt FROM workspaces WHERE owner_id = ? AND deleted_at > ? ORDER BY deleted_at DESC")
    .bind(userId, now - RESTORE_MS)
    .all<Omit<DeletedWorkspace, "eraseAt">>();
  return results.map((workspace) => ({ ...workspace, eraseAt: workspace.deletedAt + RESTORE_MS }));
}

/** Brings back one of the user's own deleted workspaces. False if there is none to restore. */
export async function restoreWorkspace(db: D1Database, userId: string, workspaceId: string, now = Date.now()): Promise<boolean> {
  const result = await db
    .prepare("UPDATE workspaces SET deleted_at = NULL WHERE id = ? AND owner_id = ? AND deleted_at > ?")
    .bind(workspaceId, userId, now - RESTORE_MS)
    .run();
  return result.meta.changes > 0;
}

/** Erases every workspace deleted more than RESTORE_DAYS ago: notes first, then its records. Returns how many. */
export async function eraseDeletedWorkspaces(env: Env, now = Date.now()): Promise<number> {
  const { results } = await env.DB.prepare("SELECT id FROM workspaces WHERE deleted_at IS NOT NULL AND deleted_at <= ?")
    .bind(now - RESTORE_MS)
    .all<{ id: string }>();
  for (const { id } of results) {
    await env.WORKSPACE.getByName(id).erase();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM memberships WHERE workspace_id = ?").bind(id),
      env.DB.prepare("DELETE FROM workspaces WHERE id = ? AND deleted_at IS NOT NULL").bind(id),
    ]);
  }
  return results.length;
}

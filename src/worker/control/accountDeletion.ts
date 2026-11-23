import { oauthApi } from "../auth/oauth";

/**
 * Deletes an account at once, at the user's own request from the web app (the id comes only from
 * their session). Every connected app is disconnected first, then every workspace they own is erased
 * with its notes, then their records go. Other people's workspaces they were a member of are left as
 * they are; only the membership goes. Each step can be run again, so a failure part way is retried
 * by asking again.
 */
export async function deleteAccount(env: Env, userId: string): Promise<void> {
  const oauth = oauthApi(env);
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(userId, { cursor });
    for (const grant of page.items) await oauth.revokeGrant(grant.id, userId);
    cursor = page.cursor;
  } while (cursor);

  const { results } = await env.DB.prepare("SELECT id FROM workspaces WHERE owner_id = ?").bind(userId).all<{ id: string }>();
  for (const { id } of results) await env.WORKSPACE.getByName(id).erase();

  const owned = "SELECT id FROM workspaces WHERE owner_id = ?";
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    env.DB.prepare(`DELETE FROM source_connections WHERE user_id = ? OR workspace_id IN (${owned})`).bind(userId, userId),
    env.DB.prepare(`DELETE FROM memberships WHERE user_id = ? OR workspace_id IN (${owned})`).bind(userId, userId),
    env.DB.prepare("DELETE FROM workspaces WHERE owner_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}

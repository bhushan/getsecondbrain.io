/** Hourly: sync every connected source of every live workspace. One failure never stops the rest. */
export async function syncAllSources(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT c.workspace_id AS workspaceId, c.provider FROM source_connections c
     JOIN workspaces w ON w.id = c.workspace_id WHERE w.deleted_at IS NULL ORDER BY c.created_at`,
  ).all<{ workspaceId: string; provider: string }>();
  let synced = 0;
  for (const { workspaceId, provider } of results) {
    if (provider !== "granola") continue;
    try {
      await env.WORKSPACE.getByName(workspaceId).syncGranola();
      synced++;
    } catch (error) {
      console.error("source sync failed", { workspaceId, provider, error: String(error) });
    }
  }
  return synced;
}

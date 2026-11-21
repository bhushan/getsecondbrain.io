import { env, exports } from "cloudflare:workers";
import { createSession, listWorkspaces, upsertGoogleUser } from "../../src/worker/control/accounts";

export const APP = "https://app.test";
export const MCP = "https://mcp.test";

/** A signed-in user with a fresh account and workspace. */
export async function signIn(email = `user-${crypto.randomUUID()}@example.com`) {
  const user = await upsertGoogleUser(env.DB, { sub: `sub-${crypto.randomUUID()}`, email, name: "Test User" });
  const session = await createSession(env.DB, user.id);
  const workspaces = await listWorkspaces(env.DB, user.id);
  const cookie = `__Host-sb_session=${session.token}`;
  const api = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    if (init.method && init.method !== "GET") headers.set("origin", APP);
    return exports.default.fetch(`${APP}${path}`, { ...init, headers });
  };
  return { user, cookie, workspaceId: workspaces[0]!.id, api };
}

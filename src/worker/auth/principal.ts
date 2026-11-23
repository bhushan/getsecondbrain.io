import { listWorkspaces, membership, type User, userForSession } from "../control/accounts";
import type { Actor } from "../workspace/types";
import { readCookie, SESSION_COOKIE } from "./cookies";

export type Scope = "read" | "write";

/** The verified caller of a request. The workspace id is only ever taken from here. */
export interface Principal {
  userId: string;
  workspaceId: string;
  scopes: Scope[];
  /** Connected app name when the call comes over MCP. */
  app?: string;
  /** Whether that app's identity was verified when it connected. */
  appVerified?: boolean;
}

export const actorOf = (principal: Principal): Actor =>
  principal.app ? { kind: "app", id: principal.userId, app: principal.app, verified: principal.appVerified === true } : { kind: "user", id: principal.userId };

/** The signed-in user from the session cookie, or null. */
export async function sessionUser(request: Request, env: Pick<Env, "DB">): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  return token ? userForSession(env.DB, token) : null;
}

export type WebPrincipalResult =
  | { status: "ok"; user: User; principal: Principal }
  | { status: "signed_out" }
  | { status: "forbidden" };

/**
 * The web app's caller. The workspace comes from the `x-workspace` header when present, and is
 * only accepted if the signed-in user is a member of it; otherwise the user's first workspace.
 */
export async function webPrincipal(request: Request, env: Pick<Env, "DB">): Promise<WebPrincipalResult> {
  const user = await sessionUser(request, env);
  if (!user) return { status: "signed_out" };
  const requested = request.headers.get("x-workspace");
  const workspace = requested ? await membership(env.DB, user.id, requested) : (await listWorkspaces(env.DB, user.id))[0];
  if (!workspace) return { status: "forbidden" };
  return { status: "ok", user, principal: { userId: user.id, workspaceId: workspace.id, scopes: ["read", "write"] } };
}

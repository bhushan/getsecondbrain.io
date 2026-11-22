import { hosts } from "../config";
import { membership, type User } from "../control/accounts";
import type { Principal } from "../auth/principal";
import { sessionUser } from "../auth/principal";
import { sourcesKey } from "./crypto";
import { authorizeUrl, exchangeCode, GRANOLA_CALLBACK_PATH, pkceChallenge, randomToken, registerClient } from "./granolaClient";

/** A pending Granola sign-in lives this long. */
const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `source-state:${state}`;

interface PendingConnect {
  userId: string;
  workspaceId: string;
  clientId: string;
  verifier: string;
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const back = (query: string) => new Response(null, { status: 303, headers: { location: `/sources?${query}`, "cache-control": "no-store" } });
const callbackUrl = (env: Env) => `${hosts(env).appOrigin}${GRANOLA_CALLBACK_PATH}`;

/** `/api/sources…` for the signed-in web app. The workspace is the principal's, never a parameter. */
export async function handleSourcesApi(request: Request, env: Env, user: User, principal: Principal): Promise<Response | null> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  const workspace = env.WORKSPACE.getByName(principal.workspaceId);

  switch (route) {
    case "GET /api/sources":
      return json({ sources: await workspace.sourceStatus() });

    case "POST /api/sources/granola/connect": {
      if (!(await sourcesKey(env))) return json({ error: "Sources are not set up on this server yet" }, 503);
      const redirectUri = callbackUrl(env);
      const clientId = await registerClient(redirectUri);
      const state = randomToken();
      const verifier = randomToken();
      const pending: PendingConnect = { userId: user.id, workspaceId: principal.workspaceId, clientId, verifier };
      await env.OAUTH_KV.put(stateKey(state), JSON.stringify(pending), { expirationTtl: STATE_TTL_SECONDS });
      return json({ url: authorizeUrl({ clientId, redirectUri, challenge: await pkceChallenge(verifier), state }) });
    }

    case "POST /api/sources/granola/sync":
      return json(await workspace.syncGranola());

    case "DELETE /api/sources/granola":
      await workspace.disconnectGranola();
      await env.DB.prepare("DELETE FROM source_connections WHERE workspace_id = ? AND provider = 'granola'").bind(principal.workspaceId).run();
      return json({ ok: true });

    default:
      return null;
  }
}

/**
 * GET /sources/granola/callback: Granola sends the browser back here. The workspace comes from the
 * pending sign-in we stored, which is bound to the user who started it.
 */
export async function finishGranolaConnect(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const user = await sessionUser(request, env);
  if (!user) return new Response(null, { status: 303, headers: { location: "/" } });

  const state = url.searchParams.get("state") ?? "";
  const raw = state ? await env.OAUTH_KV.get(stateKey(state)) : null;
  if (!raw) return back("error=expired");
  const pending = JSON.parse(raw) as PendingConnect;
  if (pending.userId !== user.id) return new Response("This sign-in was started by someone else.", { status: 403 });
  await env.OAUTH_KV.delete(stateKey(state));
  if (!(await membership(env.DB, user.id, pending.workspaceId))) return new Response("Not a member of that workspace.", { status: 403 });

  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("error")) return back("error=denied");
  const result = await exchangeCode({ clientId: pending.clientId, code, redirectUri: callbackUrl(env), verifier: pending.verifier });
  if (!result.ok) return back("error=failed");

  await env.WORKSPACE.getByName(pending.workspaceId).connectGranola({ userId: user.id, clientId: pending.clientId, tokens: result.tokens });
  await env.DB.prepare(
    `INSERT INTO source_connections (workspace_id, provider, user_id, created_at) VALUES (?, 'granola', ?, ?)
     ON CONFLICT (workspace_id, provider) DO UPDATE SET user_id = excluded.user_id`,
  )
    .bind(pending.workspaceId, user.id, Date.now())
    .run();
  return back("connected=granola");
}

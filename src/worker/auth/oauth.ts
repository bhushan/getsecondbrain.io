import {
  AuthorizationError,
  CimdFetchError,
  type ConsentDescription,
  OAuthAuthorizationServer,
  type OAuthHelpers,
  OAuthResourceServer,
} from "@cloudflare/workers-oauth-provider";
import { listWorkspaces, membership, type User, type WorkspaceInfo } from "../control/accounts";
import { hosts } from "../config";
import { handleMcp } from "../mcp/server";
import type { Principal, Scope } from "./principal";
import { sessionUser } from "./principal";

export const READ_SCOPE = "notes:read";
export const WRITE_SCOPE = "notes:write";

/** What a grant carries into every MCP request. Fixed at consent time. */
export interface GrantProps {
  userId: string;
  workspaceId: string;
  app: string;
}

interface Servers {
  authorization: OAuthAuthorizationServer<Env>;
  resource: OAuthResourceServer<Env, GrantProps>;
}

const cache = new Map<string, Servers>();

/** The authorization server (on the app host) and the MCP resource (on the MCP host), built once per configuration. */
export function servers(env: Env): Servers {
  const { appOrigin, mcpResource } = hosts(env);
  const key = `${appOrigin} ${mcpResource}`;
  let found = cache.get(key);
  if (!found) {
    const authorization = new OAuthAuthorizationServer<Env>({
      issuer: appOrigin,
      resources: [mcpResource],
      scopesSupported: [READ_SCOPE, WRITE_SCOPE, "offline_access"],
      clientIdMetadataDocumentEnabled: true,
      clientRegistrationEndpoint: "/oauth/register",
      refreshTokenIdleTTL: 60 * 24 * 60 * 60,
    });
    const resource = new OAuthResourceServer<Env, GrantProps>({
      resourceMetadata: { resource: mcpResource, authorization_servers: [appOrigin] },
      requiredScopes: [READ_SCOPE],
      validateToken: (env) => (resource, token) => authorization.validateToken<GrantProps>(resource, token, env),
      handler: {
        async fetch(request, env, ctx) {
          const props = ctx.props;
          // The grant names one workspace; the user must still belong to it.
          if (!(await membership(env.DB, props.userId, props.workspaceId))) {
            return Response.json({ error: "This connection no longer has access to its workspace." }, { status: 403 });
          }
          const scopes: Scope[] = [];
          if (ctx.auth.scope.includes(READ_SCOPE)) scopes.push("read");
          if (ctx.auth.scope.includes(WRITE_SCOPE)) scopes.push("write");
          const principal: Principal = { userId: props.userId, workspaceId: props.workspaceId, app: props.app, scopes };
          return handleMcp(request, env, ctx, principal);
        },
      },
    });
    found = { authorization, resource };
    cache.set(key, found);
  }
  return found;
}

export const oauthApi = (env: Env): OAuthHelpers => servers(env).authorization.getOAuthApi(env);

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const shell = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>
:root{--bg:#17324d;--line-bg:#2b4a6b;--card:#f5f8fc;--ink:#14202e;--muted:#586878;--line:#d3deea;--accent:#1d5ba3;--accent-ink:#fff;--warn:#8a4b00}
@media (prefers-color-scheme:dark){:root{--card:#0e1a27;--ink:#e4ecf5;--muted:#93a4b8;--line:#223549;--accent:#8fb3d9;--accent-ink:#0e1a27;--warn:#f0b45e}}
body{margin:0;min-height:100vh;color:var(--ink);font:16px/1.5 "Avenir Next","Segoe UI",system-ui,sans-serif;
background:linear-gradient(var(--line-bg) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(90deg,var(--line-bg) 1px,transparent 1px) 0 0/48px 48px,var(--bg)}
main{max-width:30rem;margin:0 auto;padding:8vh 16px}
.card{background:var(--card);border-radius:14px;padding:28px}
h1{font:400 1.6rem/1.2 "Iowan Old Style",Charter,Georgia,serif;margin:0 0 12px} p{margin:0 0 12px} .muted{color:var(--muted);font-size:.9rem}
.warn{color:var(--warn)} fieldset{border:1px solid var(--line);border-radius:8px;margin:16px 0;padding:8px 14px}
legend{font-size:.85rem;color:var(--muted);padding:0 4px} label{display:flex;gap:10px;align-items:flex-start;padding:6px 0;cursor:pointer}
input{accent-color:var(--accent)}
.actions{display:flex;gap:10px;margin-top:20px} button{font:inherit;padding:9px 18px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
:focus-visible{outline:2px solid #ffc857;outline-offset:2px}
</style></head><body><main><div class="card">${body}</div></main></body></html>`;

function consentPage(details: ConsentDescription, handle: string, user: User, workspaces: WorkspaceInfo[]): string {
  const name = escape(details.clientName);
  const origin = details.clientDomain
    ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
    : "This app registered itself, so its name is not verified.";
  const loopback = details.redirectIsLoopback
    ? `<p class="warn"><strong>Access goes to an app on your computer.</strong> Continue only if you just started connecting from it.</p>`
    : "";
  const options = workspaces
    .map(
      (workspace, index) =>
        `<label><input type="radio" name="workspace" value="${escape(workspace.id)}"${index === 0 ? " checked" : ""}> ${escape(workspace.name)}</label>`,
    )
    .join("");
  return shell(
    `Connect ${details.clientName}`,
    `<h1>Connect ${name} to your second brain?</h1>
<p class="muted">${origin} Access will be sent to <strong>${escape(details.redirectHost)}</strong>.</p>
${loopback}
<form method="post">
<input type="hidden" name="handle" value="${escape(handle)}">
<fieldset><legend>Workspace it can use</legend>${options}</fieldset>
<fieldset><legend>Permissions</legend>
<label><input type="checkbox" checked disabled> Search and read notes</label>
<label><input type="checkbox" name="write" value="on" checked> Create and edit notes (it can never delete them)</label>
</fieldset>
<p class="muted">Signed in as ${escape(user.email)}. You can disconnect it at any time from Connected apps.</p>
<div class="actions"><button class="primary" name="decision" value="approve">Connect</button><button name="decision" value="deny">Cancel</button></div>
</form>`,
  );
}

const htmlError = (status: number, message: string) =>
  new Response(shell("Could not connect", `<h1>Could not connect</h1><p>${escape(message)}</p>`), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'" },
  });

/** GET and POST /authorize: sign in, pick a workspace and permissions, then issue the grant. */
export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const oauth = oauthApi(env);
  try {
    const user = await sessionUser(request, env);
    if (request.method === "GET") {
      const authRequest = await oauth.parseAuthRequest(request);
      if (!user) {
        const url = new URL(request.url);
        const next = encodeURIComponent(url.pathname + url.search);
        return new Response(null, { status: 302, headers: { location: `/auth/login?next=${next}`, "cache-control": "no-store" } });
      }
      const workspaces = await listWorkspaces(env.DB, user.id);
      if (!workspaces.length) return htmlError(403, "Your account has no workspace yet.");
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      consent.headers.set("content-type", "text/html; charset=utf-8");
      return new Response(consentPage(details, consent.handle, user, workspaces), { headers: consent.headers });
    }

    if (request.method === "POST") {
      if (!user) return htmlError(401, "Your session ended. Start connecting again from the app.");
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      // The workspace is a form value, so it is only trusted after checking membership.
      const workspace = await membership(env.DB, user.id, String(form.get("workspace") ?? ""));
      if (!workspace) return htmlError(403, "That workspace is not yours.");
      const scope = form.get("write") === "on" ? [READ_SCOPE, WRITE_SCOPE, "offline_access"] : [READ_SCOPE, "offline_access"];
      const approved = await oauth.approveConsent(request, handle, { scope });
      const details = await oauth.describeConsent(approved.request);
      const app = details.clientDomain ?? details.clientName;
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: user.id,
        metadata: { workspaceId: workspace.id, workspaceName: workspace.name, app },
        scope: approved.request.scope,
        props: { userId: user.id, workspaceId: workspace.id, app } satisfies GrantProps,
      });
      approved.headers.set("location", redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
    if (error instanceof AuthorizationError) return htmlError(400, error.description ?? "The request was not valid.");
    if (error instanceof CimdFetchError) return htmlError(400, "This app could not be verified.");
    throw error;
  }
}

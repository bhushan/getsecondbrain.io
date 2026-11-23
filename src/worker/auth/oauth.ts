import {
  AuthorizationError,
  CimdFetchError,
  OAuthAuthorizationServer,
  type OAuthHelpers,
  OAuthResourceServer,
} from "@cloudflare/workers-oauth-provider";
import { listWorkspaces, membership } from "../control/accounts";
import { hosts } from "../config";
import { handleMcp } from "../mcp/server";
import type { Principal, Scope } from "./principal";
import { consentPage, messagePage } from "./pages";
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
          const principal: Principal = { userId: props.userId, workspaceId: props.workspaceId, app: props.app || "Unnamed app", scopes };
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

const htmlError = (status: number, title: string, message: string) =>
  new Response(messagePage(title, message, { href: "/", label: "Open Second Brain" }), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'" },
  });

/** GET and POST /authorize: sign in, pick a workspace and permissions, then issue the grant. */
export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const oauth = oauthApi(env);
  try {
    const user = await sessionUser(request, env);
    if (request.method === "GET") {
      // Sign in first: parsing may fetch the app's metadata document, which strangers must not trigger.
      if (!user) {
        const url = new URL(request.url);
        const next = encodeURIComponent(url.pathname + url.search);
        return new Response(null, { status: 302, headers: { location: `/auth/login?next=${next}`, "cache-control": "no-store" } });
      }
      const authRequest = await oauth.parseAuthRequest(request);
      const workspaces = await listWorkspaces(env.DB, user.id);
      if (!workspaces.length) return htmlError(403, "No workspace yet", "Your account has no workspace yet. Open Second Brain to set one up, then connect the app again.");
      const details = await oauth.describeConsent(authRequest);
      const consent = await oauth.beginConsent(authRequest);
      consent.headers.set("content-type", "text/html; charset=utf-8");
      return new Response(consentPage({
          clientName: details.clientName,
          clientDomain: details.clientDomain,
          redirectHost: details.redirectHost,
          redirectIsLoopback: details.redirectIsLoopback,
          handle: consent.handle,
          email: user.email,
          workspaces,
        }), { headers: consent.headers });
    }

    if (request.method === "POST") {
      if (!user) return htmlError(401, "Your session ended", "You were signed out before connecting finished. Start connecting again from the app.");
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      // The workspace is a form value, so it is only trusted after checking membership.
      const workspace = await membership(env.DB, user.id, String(form.get("workspace") ?? ""));
      if (!workspace) return htmlError(403, "That workspace is not yours", "Nothing was shared. Start connecting again from the app and pick one of your workspaces.");
      const scope = form.get("write") === "on" ? [READ_SCOPE, WRITE_SCOPE, "offline_access"] : [READ_SCOPE, "offline_access"];
      const approved = await oauth.approveConsent(request, handle, { scope });
      const details = await oauth.describeConsent(approved.request);
      // Never empty: an MCP caller with no app name would be treated as the user.
      const app = details.clientDomain || details.clientName || "Unnamed app";
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
    if (error instanceof AuthorizationError) return htmlError(400, "Could not connect", error.description ?? "The request was not valid.");
    if (error instanceof CimdFetchError) return htmlError(400, "This app could not be verified", "Second Brain could not check who this app is, so nothing was shared. Try connecting again from the app.");
    throw error;
  }
}
